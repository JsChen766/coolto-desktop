import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { extractEvidenceNumbers } from "../evidence-numbers.js";
import type { AvailableEvidenceCandidate } from "../quality/types.js";
import { findRepeatedFragment } from "./text-repetition.js";

const MAX_CONCURRENCY = 8;
const MAX_REWRITE_ROUNDS = 2;
const LENGTH_TOLERANCE = { min: 0.8, max: 1.15 };

export interface BulletWritingRequest {
  bulletIndex: number;
  itemId: string;
  experienceId: string;
  evidence: AvailableEvidenceCandidate[];
  targetChars: { min: number; max: number };
  language: "zh-CN" | "en-US";
  /** 1 for the first attempt; higher for bounded rewrites. */
  attempt?: number;
  /** Reason the previous attempt failed, used to steer the rewrite. */
  rewriteReason?: string;
}

export interface BulletWritingResult {
  bulletIndex: number;
  bulletText: string;
  evidenceIds: string[];
}

export interface ParallelWriterOptions {
  model: Model<Api>;
  streamFn: StreamFn;
  apiKey?: string;
  /** Injectable bullet text request (tests); defaults to the LLM stream. */
  requestText?: (request: BulletWritingRequest) => Promise<string>;
}

/**
 * Plan-driven bullet writer. Every planned bullet is an independent writing
 * task (evidence and character target are fixed by the plan), so the host
 * fires them concurrently instead of letting one agent call author several
 * bullets at once. Failed bullets (empty, out of length, untraceable numbers)
 * go to a bounded rewrite queue, also concurrent.
 */
export class ParallelBulletWriter {
  public constructor(private readonly options: ParallelWriterOptions) {}

  public async writeAll(
    requests: readonly BulletWritingRequest[],
  ): Promise<BulletWritingResult[]> {
    const results: BulletWritingResult[] = [];
    let pending = [...requests];
    for (let round = 0; round < MAX_REWRITE_ROUNDS + 1 && pending.length; round += 1) {
      const batch = await runConcurrent(pending, MAX_CONCURRENCY, (request) =>
        this.writeOne({ ...request, attempt: round + 1 }),
      );
      for (let index = 0; index < pending.length; index += 1) {
        const request = pending[index]!;
        const failure = batch.find(
          (entry) => !entry.ok && entry.request.bulletIndex === request.bulletIndex,
        );
        if (failure && failure.ok === false) {
          pending[index] = {
            ...request,
            attempt: round + 2,
            rewriteReason: failure.reason,
          };
        }
      }
      const accepted = batch.filter((entry) => entry.ok) as Array<{
        ok: true;
        request: BulletWritingRequest;
        result: BulletWritingResult;
      }>;
      results.push(...accepted.map((entry) => entry.result));
      const failed = batch.filter((entry) => !entry.ok) as Array<{
        ok: false;
        request: BulletWritingRequest;
        reason: string;
      }>;
      if (round >= MAX_REWRITE_ROUNDS) {
        for (const entry of failed) {
          throw new Error(
            `Bullet ${entry.request.bulletIndex + 1} failed after rewrite: ${entry.reason}`,
          );
        }
        break;
      }
      pending = failed.map((entry) => entry.request);
      for (const entry of failed) {
        process.stderr.write(
          `bullet ${entry.request.bulletIndex} rewrite: ${entry.reason}\n`,
        );
      }
    }
    return results.sort((left, right) => left.bulletIndex - right.bulletIndex);
  }

  private async writeOne(
    request: BulletWritingRequest,
  ): Promise<
    | { ok: true; request: BulletWritingRequest; result: BulletWritingResult }
    | { ok: false; request: BulletWritingRequest; reason: string }
  > {
    try {
      const text = this.options.requestText
        ? await this.options.requestText(request)
        : await this.#requestBulletText(request);
      const problem = validateBulletText(text, request);
      if (problem) {
        return { ok: false, request, reason: problem };
      }
      return {
        ok: true,
        request,
        result: {
          bulletIndex: request.bulletIndex,
          bulletText: text.trim(),
          evidenceIds: request.evidence.map((candidate) => candidate.evidenceId),
        },
      };
    } catch (error) {
      return {
        ok: false,
        request,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async #requestBulletText(request: BulletWritingRequest): Promise<string> {
    const quotes = request.evidence.map((candidate) => candidate.sourceQuote);
    const charTarget =
      request.language === "zh-CN"
        ? `${request.targetChars.min}-${request.targetChars.max} 个汉字`
        : `${request.targetChars.min}-${request.targetChars.max} characters`;
    const tooLong =
      request.rewriteReason !== undefined &&
      /length \d+ outside target/.test(request.rewriteReason) &&
      Number.parseInt(
        /length (\d+)/.exec(request.rewriteReason)?.[1] ?? "0",
        10,
      ) > request.targetChars.max;
    const systemPrompt =
      "你是简历写作助手。只输出 JSON：{\"text\": \"...\"}。不得包含其他内容。";
    const userPrompt = [
      `基于以下经历事实写一条简历 bullet：`,
      ...quotes.map((quote) => `- ${quote}`),
      `要求：`,
      `1. 用${request.language === "zh-CN" ? "中文" : "英文"}写，长度 ${charTarget}`,
      ...(tooLong
        ? [`2. 上次因过长被拒（${request.rewriteReason}）。这次必须显著缩短，最终长度不得超过 ${request.targetChars.max} 字符，删去冗余修饰。`]
        : []),
      ...(request.rewriteReason && !tooLong
        ? [`2. 上次失败原因：${request.rewriteReason}。这次必须加长、更具体，充实方法与结果细节，落在目标长度内。`]
        : []),
      `${request.rewriteReason ? "3" : "2"}. 基于事实展开（动作、方法、过程、结果），不得编造证据中没有的事实`,
      `${request.rewriteReason ? "4" : "3"}. 所有数字必须与证据原文完全一致，不得换算或新增`,
      `${request.rewriteReason ? "5" : "4"}. 写成完整通顺的一句话；${
        request.language === "zh-CN"
          ? "宁长勿短，尽量接近长度上限，过短会被拒绝重写"
          : "严格控制在目标长度内，过长或过短都会被拒绝重写"
      }`,
    ].join("\n");
    const stream = this.options.streamFn(
      this.options.model,
      {
        systemPrompt,
        messages: [{ role: "user", content: userPrompt, timestamp: Date.now() }],
        tools: [],
      },
      {
        temperature: request.rewriteReason ? 0.7 : 0,
        ...(this.options.apiKey ? { apiKey: this.options.apiKey } : {}),
      },
    );
    const resolved = await stream;
    let text = "";
    for await (const event of resolved) {
      if (event.type === "text_delta") text += event.delta;
      if (event.type === "done" || event.type === "error") break;
    }
    return parseBulletJson(text);
  }
}

export function validateBulletText(
  text: string,
  request: BulletWritingRequest,
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "empty bullet text";
  const length = [...trimmed].length;
  if (
    length < request.targetChars.min * LENGTH_TOLERANCE.min ||
    length > request.targetChars.max * LENGTH_TOLERANCE.max
  ) {
    return `length ${length} outside target ${request.targetChars.min}-${request.targetChars.max}`;
  }
  const sourceNumbers = extractEvidenceNumbers(
    request.evidence.map((candidate) => candidate.sourceQuote).join("\n"),
  );
  const missing = extractEvidenceNumbers(trimmed).filter(
    (value) => !sourceNumbers.includes(value),
  );
  if (missing.length) {
    return `numbers absent from evidence: ${[...new Set(missing)].join(", ")}`;
  }
  const repeated = findRepeatedFragment(trimmed);
  if (repeated) {
    return `repeated fragment "${repeated}"`;
  }
  return null;
}

function parseBulletJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`writer returned non-JSON: ${raw.slice(0, 80)}`);
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { text?: string };
  if (typeof parsed.text !== "string" || !parsed.text.trim()) {
    throw new Error("writer JSON missing text field");
  }
  return parsed.text;
}

async function runConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await task(items[index]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
