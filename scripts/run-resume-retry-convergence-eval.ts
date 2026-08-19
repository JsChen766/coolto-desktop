import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import { COOLTO_SYSTEM_PROMPT } from "../src/agent/system-prompt.js";
import { loadLocalEnv, readConfig } from "../src/config.js";
import { evidenceForModel } from
  "../src/resume/workspace/agent-workspace-evidence.js";
import { ResumeWorkspaceStore } from
  "../src/resume/workspace/workspace-store.js";
import { createApplyResumeContentTool } from
  "../src/tools/agent-orchestrated/apply-content.js";
import { createGetResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/get-workspace.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "../test/support/resume-workspace-fixture.js";

class StableCountCompiler extends FixtureResumeCompiler {
  public override async compile(
    structure: Parameters<FixtureResumeCompiler["compile"]>[0],
  ) {
    const result = await super.compile(structure);
    return {
      ...result,
      qualified: true,
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 950,
      availableHeightPx: 1000,
      usageRatio: 0.95,
      bullets: result.bullets.map((bullet) => ({
        ...bullet,
        lineCount: 2,
        lastLineWidthPx: 480,
        availableLineWidthPx: 600,
        lastLineRatio: 0.8,
        passed: true,
      })),
      violations: [],
    };
  }
}

loadLocalEnv();
const config = readConfig();
const runs = positiveInt("COOLTO_RETRY_CONVERGENCE_RUNS", 3);
const reports = [];
for (let run = 1; run <= runs; run += 1) reports.push(await runOnce(run));
const artifactDir = resolve("local-builds", "resume-retry-convergence-eval");
await mkdir(artifactDir, { recursive: true });
const outputPath = resolve(artifactDir, `report-${Date.now()}.json`);
await writeFile(outputPath, `${JSON.stringify({
  modelId: config.modelId,
  reports,
}, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, reports }, null, 2)}\n`);

async function runOnce(run: number) {
  const builder = createWorkspaceSnapshotBuilder({
    jdRequirements: [{
      id: "req-1",
      text: "具备数据整理与跨团队协作能力",
      category: "domain",
      importance: "medium",
      keywords: ["数据整理"],
      weight: 0.6,
      v2Importance: "nice_to_have",
      v2Category: "domain",
    }],
  });
  const compiler = new StableCountCompiler();
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(builder, compiler, store);
  const apply = createApplyResumeContentTool(compiler, store);
  const created = parseResult(await create.execute("create", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  }));
  const evidence = evidenceForModel(store.latest()!.sourceSnapshot)
    .filter((entry) => entry.experienceId === "work-1");
  const rejected = parseResult(await apply.execute("seed-three-errors", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [{
        text: `${trimPeriod(evidence[0]!.text)}。`,
        origin: "grounded",
        evidenceIds: [evidence[0]!.evidenceId],
      }, {
        text: trimPeriod(evidence[1]!.text),
        origin: "grounded",
        evidenceIds: [],
      }, {
        text: `${trimPeriod(evidence[2]!.text)}并交付 999 个成果`,
        origin: "grounded",
        evidenceIds: [evidence[2]!.evidenceId],
      }],
    }],
  }));
  const initialErrors = rejected.operation.rejectedItems[0].errors;
  const agent = createCooltoAgent({
    apiKey: config.apiKey,
    modelId: config.modelId,
    systemPrompt: COOLTO_SYSTEM_PROMPT,
    tools: [apply, createGetResumeWorkspaceTool(store)],
    thinkingLevel: config.thinkingLevel,
  });
  const startedAt = performance.now();
  let runtimeError: string | null = null;
  try {
    await agent.prompt(
      `以下是同一次 item 写入的权威初始工作区和聚合拒绝回执。不要解释，读取 rejectedItems.errors 后一次修正全部错误并严格执行 nextAction。\n${JSON.stringify({ created, rejected })}`,
    );
  } catch (error: unknown) {
    runtimeError = error instanceof Error ? error.message : String(error);
  }
  const messages = agent.getMessages();
  const calls = toolCalls(messages, "apply_resume_content");
  const results = toolResults(messages, "apply_resume_content");
  return {
    run,
    durationMs: Number((performance.now() - startedAt).toFixed(1)),
    initialErrorCodes: initialErrors.map((entry: AnyRecord) => entry.code),
    applyCalls: calls.length,
    statuses: results.map((result) => result.operation?.status ?? null),
    remainingErrorCodes: results.flatMap((result) =>
      array(result.operation?.rejectedItems).flatMap((item) =>
        array(item.errors).map((error) => String(error.code ?? ""))
      )
    ),
    exactRepeatCalls: calls.filter((call, index) =>
      index > 0 && JSON.stringify(call) === JSON.stringify(calls[index - 1])
    ).length,
    finalRevision: store.latest()!.revision,
    finalStatus: store.latest()!.status,
    runStopError: runtimeError ?? agent.runStopError ?? null,
  };
}

function toolCalls(messages: AgentMessage[], name: string): AnyRecord[] {
  return messages.flatMap((message) => message.role === "assistant"
    ? message.content.flatMap((part) =>
        part.type === "toolCall" && part.name === name
          ? [part.arguments as AnyRecord] : [])
    : []);
}

function toolResults(messages: AgentMessage[], name: string): AnyRecord[] {
  return messages.flatMap((message) => {
    if (message.role !== "toolResult" || message.toolName !== name) return [];
    const text = message.content.flatMap((part) =>
      part.type === "text" ? [part.text] : []).join("");
    try { return [JSON.parse(text) as AnyRecord]; } catch { return [{}]; }
  });
}

type AnyRecord = Record<string, any>;
function array(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value as AnyRecord[] : [];
}
function parseResult(result: { content: readonly { type: string; text?: string }[] }) {
  return JSON.parse(String(result.content[0]?.text ?? "{}"));
}
function trimPeriod(value: string): string {
  return value.replace(/[。.]$/u, "");
}
function positiveInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
