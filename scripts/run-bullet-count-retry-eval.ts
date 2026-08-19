import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import { COOLTO_SYSTEM_PROMPT } from "../src/agent/system-prompt.js";
import { loadLocalEnv, readConfig } from "../src/config.js";
import { ResumeWorkspaceStore } from
  "../src/resume/workspace/workspace-store.js";
import { createApplyResumeContentTool } from
  "../src/tools/agent-orchestrated/apply-content.js";
import { createPauseResumeForMaterialTool } from
  "../src/tools/agent-orchestrated/pause-for-material.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "../test/support/resume-workspace-fixture.js";

const IR_SOURCE =
  "Conducted weekly monitoring of IPO pipelines (e.g. NEEQ, STAR, GEM), identified promising little giant enterprises, and generated market intelligence briefings in the Specialized Express series, which achieved 100K+ cumulative reads total of all channel。" +
  "Collaborated with VCs including Northern Venture Capital and Unity Ventures, led primary due diligence and founder interviews for 5+ semi-conductor and pan-AI startups, crafted investment memoranda and commercial models for 5+ startups in fundraises。";
const ONE_EVIDENCE_SOURCE =
  "Collaborated with VCs, conducted primary due diligence and founder interviews for 5+ semiconductor startups, and crafted investment memoranda and commercial models。";

interface ApplyAttempt {
  itemCount: number;
  bulletCount: number;
  evidenceIds: string[][];
  texts: string[];
  duplicateEvidence: boolean;
  exactRepeatOfPrevious: boolean;
  operationStatus: string | null;
  rejectedReasons: string[];
}

loadLocalEnv();
const config = readConfig();
const exactRuns = positiveInt("COOLTO_BULLET_COUNT_EVAL_RUNS", 3);
const unsatisfiableRuns = positiveInt("COOLTO_BULLET_COUNT_UNSAT_RUNS", 1);
const reports = [];
for (let run = 1; run <= exactRuns; run += 1) {
  reports.push(await runOnce("exact_failed_source", run, IR_SOURCE));
}
for (let run = 1; run <= unsatisfiableRuns; run += 1) {
  reports.push(await runOnce(
    "one_evidence_unsatisfiable",
    run,
    ONE_EVIDENCE_SOURCE,
  ));
}
const summary = {
  modelId: config.modelId,
  exactRuns,
  unsatisfiableRuns,
  reports,
};
const artifactDir = resolve("local-builds", "bullet-count-retry-eval");
await mkdir(artifactDir, { recursive: true });
const outputPath = resolve(artifactDir, `report-${Date.now()}.json`);
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  outputPath,
  runs: reports.map(({ scenario, run, durationMs, applyAttempts,
    pauseCalls, finalRevision, finalStatus, runStopError }) => ({
    scenario, run, durationMs, applyCalls: applyAttempts.length,
    statuses: applyAttempts.map((attempt) => attempt.operationStatus),
    rejectionReasons: applyAttempts.flatMap((attempt) =>
      attempt.rejectedReasons),
    duplicateEvidenceCalls: applyAttempts.filter((attempt) =>
      attempt.duplicateEvidence).length,
    exactRepeatCalls: applyAttempts.filter((attempt) =>
      attempt.exactRepeatOfPrevious).length,
    pauseCalls, finalRevision, finalStatus, runStopError,
  })),
}, null, 2)}\n`);

async function runOnce(
  scenario: string,
  run: number,
  source: string,
) {
  const builder = createWorkspaceSnapshotBuilder({
    workContent: source,
    jdRequirements: [{
      id: "req-1",
      text: "具备投资研究与信息整理能力",
      category: "domain",
      importance: "medium",
      keywords: ["投资研究"],
      weight: 0.6,
      v2Importance: "nice_to_have",
      v2Category: "domain",
    }],
  });
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(builder, compiler, store);
  const created = parseResult(await create.execute("create", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "secondary" }],
  }));
  const agent = createCooltoAgent({
    apiKey: config.apiKey,
    modelId: config.modelId,
    systemPrompt: COOLTO_SYSTEM_PROMPT,
    tools: [
      createApplyResumeContentTool(compiler, store),
      createPauseResumeForMaterialTool(store),
    ],
    thinkingLevel: config.thinkingLevel,
  });
  const startedAt = performance.now();
  let runtimeError: string | null = null;
  try {
    await agent.prompt(
      `这是简历生成中的最新权威工作区，请不要解释或规划，直接严格执行 nextAction。\n${JSON.stringify(created)}`,
    );
  } catch (error: unknown) {
    runtimeError = error instanceof Error ? error.message : String(error);
  }
  const messages = agent.getMessages();
  const applyAttempts = pairApplyAttempts(messages);
  const latest = store.latest()!;
  const report = {
    scenario,
    run,
    durationMs: Number((performance.now() - startedAt).toFixed(1)),
    modelCallCount: agent.modelCallCount,
    applyAttempts,
    pauseCalls: toolCalls(messages, "pause_resume_for_material").length,
    finalRevision: latest.revision,
    finalStatus: latest.status,
    finalBulletCount: latest.structure.sections.flatMap((section) =>
      section.items.find((item) => item.id === "item-work-1")?.bullets ?? []
    ).length,
    runStopError: runtimeError ?? agent.runStopError ?? null,
  };
  process.stdout.write(`${JSON.stringify({
    scenario, run, durationMs: report.durationMs,
    applyCalls: applyAttempts.length,
    statuses: applyAttempts.map((attempt) => attempt.operationStatus),
    pauseCalls: report.pauseCalls,
    finalRevision: report.finalRevision,
    finalStatus: report.finalStatus,
    runStopError: report.runStopError,
  })}\n`);
  return report;
}

function pairApplyAttempts(messages: AgentMessage[]): ApplyAttempt[] {
  const calls = toolCalls(messages, "apply_resume_content");
  const results = toolResults(messages, "apply_resume_content");
  return calls.map((parameters, index) => {
    const items = array(parameters.items);
    const bullets = items.flatMap((item) => array(item.bullets));
    const evidenceIds = bullets.map((bullet) =>
      array(bullet.evidenceIds).map(String));
    const flatEvidence = evidenceIds.flat();
    const fingerprint = JSON.stringify(parameters);
    const result = results[index];
    return {
      itemCount: items.length,
      bulletCount: bullets.length,
      evidenceIds,
      texts: bullets.map((bullet) => String(bullet.text ?? "")),
      duplicateEvidence: new Set(flatEvidence).size < flatEvidence.length,
      exactRepeatOfPrevious: index > 0 &&
        fingerprint === JSON.stringify(calls[index - 1]),
      operationStatus: stringAt(result, "operation", "status"),
      rejectedReasons: array(result?.operation?.rejectedItems)
        .map((item) => String(item.reason ?? "")),
    };
  });
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
function stringAt(value: AnyRecord | undefined, ...path: string[]) {
  let current: unknown = value;
  for (const key of path) current = (current as AnyRecord | undefined)?.[key];
  return typeof current === "string" ? current : null;
}
function parseResult(result: { content: readonly { type: string; text?: string }[] }) {
  return JSON.parse(String(result.content[0]?.text ?? "{}"));
}
function positiveInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
