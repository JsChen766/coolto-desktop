import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import { CooltoApiClient } from "../src/api/coolto-api-client.js";
import { loadLocalEnv, readConfig } from "../src/config.js";
import { allEvidenceCandidates } from "../src/resume/quality/evidence-candidates.js";
import { ResumeSourceSnapshotBuilder } from "../src/resume/source-snapshot.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import { resolveEvidenceBindingInput } from "../src/resume/workspace/evidence-resolution.js";
import { evidenceBindingSchema } from "../src/tools/resume-candidate/schemas.js";

const ZH_TARGET = { min: 92, max: 110 };
const EN_TARGET = { min: 175, max: 208 };
const MAX_SUBMITS = 3;

interface EvalSample {
  id: string;
  jdId: string;
  experienceId: string;
  language: "zh-CN" | "en-US";
  targetCount: number;
}

interface RunResult {
  round: number;
  elapsedMs: number;
  toolCalls: number;
  submitted: number;
  accepted: number;
  bulletResults: Array<{ ok: boolean; errors: string[]; length: number }>;
}

loadLocalEnv();
const config = readConfig();
if (config.apiBaseUrl !== "http://127.0.0.1:8080") {
  throw new Error("Bullet eval only permits http://127.0.0.1:8080");
}
const runsPerSample = Number.parseInt(process.env.COOLTO_BULLET_EVAL_RUNS ?? "3", 10);
const artifactDir =
  process.env.COOLTO_BULLET_EVAL_ARTIFACT_DIR ??
  "local-docs/p0-product-completion-roadmap/s45f-perf/bullet-eval";
await mkdir(artifactDir, { recursive: true });

const client = new CooltoApiClient({ baseUrl: config.apiBaseUrl });
await client.login({
  email: process.env.COOLTO_PERF_EMAIL!,
  password: process.env.COOLTO_PERF_PASSWORD!,
});

const manifest = JSON.parse(
  await readFile(
    process.env.COOLTO_RESUME_PERF_MANIFEST_PATH!,
    "utf8",
  ),
) as { jdIds: Record<string, string>; experienceIds: string[] };

const samples: EvalSample[] = [
  {
    id: "zh-work-jiangxi",
    jdId: manifest.jdIds["zh-ai"]!,
    experienceId: manifest.experienceIds[3]!,
    language: "zh-CN",
    targetCount: 4,
  },
  {
    id: "zh-project-moxibustion",
    jdId: manifest.jdIds["zh-ai"]!,
    experienceId: manifest.experienceIds[4]!,
    language: "zh-CN",
    targetCount: 3,
  },
  {
    id: "zh-edu-ncu",
    jdId: manifest.jdIds["zh-ai"]!,
    experienceId: manifest.experienceIds[0]!,
    language: "zh-CN",
    targetCount: 2,
  },
  {
    id: "en-project-wiki",
    jdId: manifest.jdIds["en-data"]!,
    experienceId: manifest.experienceIds[6]!,
    language: "en-US",
    targetCount: 3,
  },
  {
    id: "en-work-weex",
    jdId: manifest.jdIds["en-data"]!,
    experienceId: manifest.experienceIds[2]!,
    language: "en-US",
    targetCount: 4,
  },
];

const report = { modelId: config.modelId, runsPerSample, samples: [] as Array<object> };
try {
  for (const sample of samples) {
    const runs: RunResult[] = [];
    for (let round = 1; round <= runsPerSample; round += 1) {
      runs.push(await runOne(sample, round));
      process.stdout.write(
        `${JSON.stringify({ sample: sample.id, round, ...summarizeRun(runs.at(-1)!) })}\n`,
      );
    }
    report.samples.push(summarizeSample(sample.id, runs));
  }
} finally {
  await client.logout().catch(() => undefined);
}
const outputPath = resolve(artifactDir, "report.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

async function runOne(sample: EvalSample, round: number): Promise<RunResult> {
  const startedAt = performance.now();
  const builder = new ResumeSourceSnapshotBuilder({
    currentUser: client,
    profile: { getUserProfile: async () => syntheticProfile() },
    jd: client,
    experience: client,
  });
  const snapshot = await builder.build({
    jdId: sample.jdId,
    experienceIds: [sample.experienceId],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const experience = snapshot.experiences[0]!;
  const candidates = allEvidenceCandidates(snapshot).filter(
    (candidate) => candidate.experienceId === experience.id,
  );
  const evidenceMenu = candidates
    .slice(0, 14)
    .map((candidate) => ({
      evidenceId: candidate.evidenceId,
      sourceQuote: candidate.sourceQuote,
      matchedRequirementIds: candidate.matchedRequirementIds,
    }));
  const target = sample.language === "zh-CN" ? ZH_TARGET : EN_TARGET;
  const submitTool = createSubmitBulletsTool(snapshot, target, sample.language);
  const agent = createCooltoAgent({
    apiKey: config.apiKey,
    modelId: config.modelId,
    systemPrompt: evalSystemPrompt(sample.language, target),
    tools: [submitTool],
  });
  let submits = 0;
  agent.subscribe((event) => {
    if (event.type === "tool.started" && event.name === "submit_bullets") {
      submits += 1;
      if (submits > MAX_SUBMITS) agent.cancel();
    }
  });
  const requirementTexts = snapshot.jd.requirements
    .map((requirement) => requirement.text)
    .join("；");
  await agent.prompt(
    `目标 JD：${snapshot.jd.title}。JD 要求：${requirementTexts}。\n` +
      `经历：${experience.title}（${experience.organization ?? ""} ${experience.role ?? ""}）。\n` +
      `请基于下方 availableEvidence 写 ${sample.targetCount} 条 ${sample.language === "zh-CN" ? "中文" : "English"} bullet，每条 ${target.min}–${target.max} 字符。\n` +
      `availableEvidence：${JSON.stringify(evidenceMenu)}`,
  );
  const bulletResults = extractBulletResults(agent);
  return {
    round,
    elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
    toolCalls: submits,
    submitted: bulletResults.length,
    accepted: bulletResults.filter((result) => result.ok).length,
    bulletResults,
  };
}

function createSubmitBulletsTool(
  snapshot: Parameters<typeof resolveEvidenceBindingInput>[0],
  target: { min: number; max: number },
  language: "zh-CN" | "en-US",
): AgentTool<{ bullets: unknown[] }> {
  const parameters = Type.Object({
    bullets: Type.Array(evidenceBindingSchema, { minItems: 1, maxItems: 5 }),
  });
  return {
    name: "submit_bullets",
    label: "提交简历条目",
    description: "一次提交评测要求的全部 bullet（每条 bulletText + evidenceIds）。",
    parameters,
    execute: async (_toolCallId, params) => {
      const diagnostics = params.bullets.map((bullet, index) => {
        const errors: string[] = [];
        try {
          resolveEvidenceBindingInput(snapshot, bullet, `eval-bullet-${index}`);
        } catch (error: unknown) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
        const length = [...bullet.bulletText].length;
        if (length < target.min || length > target.max) {
          errors.push(
            `length ${length} outside target ${target.min}–${target.max} (${language === "zh-CN" ? "chars" : "characters"})`,
          );
        }
        return { index, ok: errors.length === 0, errors, length };
      });
      const accepted = diagnostics.every((diagnostic) => diagnostic.ok);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ accepted, diagnostics }),
          },
        ],
      };
    },
  };
}

function extractBulletResults(agent: {
  getMessages(): Array<{
    role: string;
    toolName?: string;
    isError?: boolean;
    content: Array<{ type: string; text: string }>;
  }>;
}): RunResult["bulletResults"] {
  for (const message of agent.getMessages()) {
    if (message.role !== "toolResult" || message.toolName !== "submit_bullets") continue;
    if (message.isError) continue;
    const text = message.content
      .filter((content) => content.type === "text")
      .map((content) => content.text)
      .join("");
    try {
      const payload = JSON.parse(text) as {
        diagnostics: Array<{ ok: boolean; errors: string[]; length: number }>;
      };
      return payload.diagnostics ?? [];
    } catch {
      return [];
    }
  }
  return [];
}

function summarizeRun(run: RunResult): object {
  return {
    toolCalls: run.toolCalls,
    submitted: run.submitted,
    accepted: run.accepted,
    avgLength: run.bulletResults.length
      ? Math.round(
          run.bulletResults.reduce((total, result) => total + result.length, 0) /
            run.bulletResults.length,
        )
      : 0,
  };
}

function summarizeSample(sampleId: string, runs: RunResult[]): object {
  const all = runs.flatMap((run) => run.bulletResults);
  const errorCodes = new Map<string, number>();
  for (const result of all) {
    for (const error of result.errors) {
      const code = /^(?:Bullet|Incremental|Every bullet|Tool|Validation)[\s\S]{0,40}?/.exec(error)?.[0] ?? error.slice(0, 40);
      errorCodes.set(code, (errorCodes.get(code) ?? 0) + 1);
    }
  }
  return {
    sampleId,
    runCount: runs.length,
    bulletsSubmitted: all.length,
    bulletsAccepted: all.filter((result) => result.ok).length,
    passRate: all.length ? all.filter((result) => result.ok).length / all.length : 0,
    avgLength: all.length
      ? Math.round(all.reduce((total, result) => total + result.length, 0) / all.length)
      : 0,
    errorCodes: Object.fromEntries(
      [...errorCodes.entries()].sort((left, right) => right[1] - left[1]),
    ),
    runs: runs.map((run) => ({
      round: run.round,
      elapsedMs: run.elapsedMs,
      toolCalls: run.toolCalls,
      submitted: run.submitted,
      accepted: run.accepted,
    })),
  };
}

function evalSystemPrompt(
  language: "zh-CN" | "en-US",
  target: { min: number; max: number },
): string {
  return `你是 Coolto 简历 bullet 写作评测 Agent。
规则：
- 只调用 submit_bullets 一次，提交全部 bullet；如果返回的诊断里只有部分 bullet 失败，只修正失败的那几条后再次提交，最多 ${MAX_SUBMITS} 次。
- 每条 bullet 是完整事实句（动作 + 对象 + 方法/范围 + 结果），不是短标签。
- evidenceIds 必须从 availableEvidence 逐字复制；禁止编造、拼接、扩展 evidenceId；每条 bullet 引用 1–3 个 evidenceId，全部属于同一经历。
- bullet 中所有数字必须逐字等价存在于引用证据中（原文 10万+ 就写 10万+，不换算为 100,000；GPA 3.3 不能写成 3.0；第十八届写 18th 时必须有对应证据）。
- 目标长度：每条 ${target.min}–${target.max} 个${language === "zh-CN" ? "字符" : "字符（characters）"}（约两行，末行至少三分之二行宽）。
- 不得编造来源中不存在的数字、技术、责任级别或结果。`.trim();
}

function syntheticProfile() {
  return {
    fullName: "Bullet Eval", contactEmail: "bullet-eval@example.test", phone: "+852 5555 0101",
    email: null, location: "Hong Kong", linkedinUrl: null, githubUrl: null, personalWebsite: null,
    currentTitle: null, currentCompany: null, yearsOfExperience: null, careerStage: null,
    targetRoles: [], targetIndustries: [], targetLocations: [], preferredLanguage: "zh-CN", resumeStyle: "standard",
  };
}
