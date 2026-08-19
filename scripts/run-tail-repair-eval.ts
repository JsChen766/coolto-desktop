import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import { COOLTO_SYSTEM_PROMPT } from "../src/agent/system-prompt.js";
import { loadLocalEnv, readConfig } from "../src/config.js";
import type { ResumeCompiler } from
  "../src/resume/workspace/compiler-port.js";
import { buildAgentWorkspaceReceipt } from
  "../src/resume/workspace/agent-workspace-view.js";
import { evidenceForModel } from
  "../src/resume/workspace/agent-workspace-evidence.js";
import { resumeGenerationReadiness } from
  "../src/resume/workspace/generation-readiness.js";
import { ResumeWorkspaceStore } from
  "../src/resume/workspace/workspace-store.js";
import { createApplyResumeContentTool } from
  "../src/tools/agent-orchestrated/apply-content.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import { createTailEvalFixture } from "./tail-repair-eval-fixture.js";

type AnyRecord = Record<string, any>;

export async function runTailRepairEval(compiler: ResumeCompiler) {
  loadLocalEnv();
  const config = readConfig();
  const fixture = createTailEvalFixture();
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(fixture.builder, compiler, store);
  const apply = createApplyResumeContentTool(compiler, store);
  const selected = fixture.experiences.map((entry) => ({
    experienceId: entry.id,
    ...(entry.tier ? { tier: entry.tier } : {}),
    ...(entry.localizedPosition
      ? { localizedPosition: entry.localizedPosition }
      : {}),
  }));
  const created = resultText(await create.execute("tail-eval-create", {
    jdId: "tail-eval-jd",
    language: "zh-CN",
    experiences: selected,
    educationCoursework: [{
      experienceId: "edu-cuhk",
      sourceQuote: "主修课程：公司金融、投资学、财务建模、证券分析、计量经济学、固定收益、衍生品定价、风险管理",
      courses: ["公司金融", "投资学", "财务建模", "证券分析", "计量经济学",
        "固定收益", "衍生品定价", "风险管理"],
    }, {
      experienceId: "edu-zju",
      sourceQuote: "主修课程：学术写作、跨文化沟通、统计学、微观经济学",
      courses: ["学术写作", "跨文化沟通", "统计学", "微观经济学"],
    }],
  }));
  if (created.status === "needs_user_decision") {
    throw new Error(`独立测试工作区创建失败：${JSON.stringify(created.nextAction)}`);
  }
  const seed = seedItems(store, fixture.experiences);
  const seeded = resultText(await apply.execute("tail-eval-seed", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: seed,
  }));
  if (seeded.operation?.status !== "success") {
    throw new Error(`独立测试首稿写入失败：${JSON.stringify(seeded.operation)}`);
  }
  const baseline = store.latest()!;
  const baselineSnapshot = layoutSnapshot(baseline);
  if (process.env.COOLTO_TAIL_REPAIR_EVAL_SEED_ONLY === "1") {
    process.stdout.write(`${JSON.stringify({ seedOnly: true,
      nextMode: seeded.nextAction?.mode, baseline: baselineSnapshot }, null, 2)}\n`);
    return { passed: false, seedOnly: true, baseline: baselineSnapshot };
  }
  assertRealisticBaseline(baselineSnapshot, seeded.nextAction?.mode);

  const agent = createCooltoAgent({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    modelId: config.modelId,
    systemPrompt: COOLTO_SYSTEM_PROMPT,
    tools: [apply],
    ...(config.thinkingLevel === "off"
      ? {}
      : { thinkingLevel: config.thinkingLevel }),
  });
  const startedAt = performance.now();
  let runtimeError: string | null = null;
  try {
    await agent.prompt(
      "以下是已经完成检索、首稿、篇幅和 2–3 行深度门槛后的真实简历工作区。" +
      "只处理 nextAction：每轮把全部当前目标作为一个 tailRepairs 批次提交，每条只有一个完整 revisedText；" +
      "基于 currentText 与来源做语义扩写，不计算字符或像素，不生成候选。\n" +
      JSON.stringify(buildAgentWorkspaceReceipt(baseline)),
    );
  } catch (error: unknown) {
    runtimeError = error instanceof Error ? error.message : String(error);
  }
  const messages = agent.getMessages();
  const applyCalls = toolCalls(messages, "apply_resume_content");
  const finalWorkspace = store.latest()!;
  const finalSnapshot = layoutSnapshot(finalWorkspace);
  const exactRepeatCalls = applyCalls.filter((call, index) =>
    index > 0 && JSON.stringify(call) === JSON.stringify(applyCalls[index - 1])
  ).length;
  const malformedCalls = applyCalls.filter((call) =>
    !Array.isArray(call.tailRepairs) || call.tailRepairs.length === 0 ||
    ["items", "bulletUpdates", "bulletAdditions", "lineRewrites"].some(
      (key) => Array.isArray(call[key]) && call[key].length > 0,
    )
  ).length;
  const candidateLikeOutputs = applyCalls.flatMap((call) =>
    Array.isArray(call.tailRepairs) ? call.tailRepairs : []
  ).filter((entry) => typeof entry?.revisedText !== "string").length;
  const finalReadiness = resumeGenerationReadiness(finalWorkspace);
  const report = {
    passed: runtimeError === null && !agent.runStopError &&
      finalWorkspace.status === "ready_for_approval" && finalReadiness.ready &&
      finalSnapshot.pageCount === 1 && finalSnapshot.overflowPx === 0 &&
      finalSnapshot.usageRatio >= 0.92 && finalSnapshot.tailFailureCount === 0 &&
      finalSnapshot.invalidTieredLineCount === 0 && exactRepeatCalls === 0 &&
      malformedCalls === 0 && candidateLikeOutputs === 0,
    modelId: config.modelId,
    durationMs: Number((performance.now() - startedAt).toFixed(1)),
    modelCallCount: agent.modelCallCount,
    applyCallCount: applyCalls.length,
    exactRepeatCalls,
    malformedCalls,
    candidateLikeOutputs,
    runtimeError: runtimeError ?? agent.runStopError ?? null,
    baseline: baselineSnapshot,
    final: finalSnapshot,
    finalStatus: finalWorkspace.status,
    blockerCodes: finalReadiness.blockers.map((entry) => entry.code),
    calls: summarizeCalls(applyCalls, messages),
  };
  const artifactDir = resolve("local-builds", "tail-repair-eval");
  await mkdir(artifactDir, { recursive: true });
  const outputPath = resolve(artifactDir, `report-${Date.now()}.json`);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...report, calls: undefined,
    outputPath }, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
  return report;
}

function seedItems(
  store: ResumeWorkspaceStore,
  experiences: ReturnType<typeof createTailEvalFixture>["experiences"],
) {
  const workspace = store.latest()!;
  const evidence = evidenceForModel(workspace.sourceSnapshot);
  return experiences.filter((entry) => entry.bullets.length).map((entry) => ({
    itemId: `item-${entry.id}`,
    bullets: entry.bullets.map((bullet) => {
      const record = evidence.find((candidate) =>
        candidate.experienceId === entry.id &&
        candidate.text.startsWith(bullet.currentText)
      );
      if (!record) throw new Error(`缺少独立测试证据：${entry.id} ${bullet.currentText}`);
      return { text: bullet.currentText, origin: "grounded" as const,
        evidenceIds: [record.evidenceId] };
    }),
  }));
}

function layoutSnapshot(workspace: NonNullable<ReturnType<ResumeWorkspaceStore["latest"]>>) {
  const tieredIds = new Set(Object.entries(workspace.itemTiers ?? {})
    .filter(([, tier]) => tier === "main" || tier === "secondary")
    .flatMap(([itemId]) => workspace.structure.sections.flatMap((section) =>
      section.items.find((item) => item.id === itemId)?.bullets.map((bullet) => bullet.id) ?? []
    )));
  const failed = workspace.compileResult.bullets.filter((bullet) => !bullet.passed);
  return { revision: workspace.revision, status: workspace.status,
    pageCount: workspace.compileResult.pageCount,
    overflowPx: workspace.compileResult.overflowPx,
    usageRatio: workspace.compileResult.usageRatio,
    bulletCount: workspace.compileResult.bullets.length,
    tailFailureCount: failed.length,
    tailFailureIds: failed.map((entry) => entry.bulletId),
    invalidTieredLineCount: workspace.compileResult.bullets.filter((entry) =>
      tieredIds.has(entry.bulletId) && (entry.lineCount < 2 || entry.lineCount > 3)
    ).length,
    lineCounts: Object.fromEntries(workspace.compileResult.bullets.map((entry) =>
      [entry.bulletId, entry.lineCount]
    )),
    tailRatios: Object.fromEntries(workspace.compileResult.bullets.map((entry) =>
      [entry.bulletId, Number(entry.lastLineRatio.toFixed(3))]
    )),
  };
}

function assertRealisticBaseline(
  baseline: ReturnType<typeof layoutSnapshot>,
  nextMode: string | undefined,
) {
  const failures = [
    baseline.pageCount !== 1 ? "不是单页" : "",
    baseline.overflowPx !== 0 ? "存在溢出" : "",
    baseline.usageRatio < 0.92 ? "页面使用率低于 92%" : "",
    baseline.invalidTieredLineCount > 0 ? "存在非 2–3 行经历 bullet" : "",
    baseline.tailFailureCount < 6 ? "短尾目标少于 6 条" : "",
    nextMode !== "batch_tail_repair" ? `nextAction=${nextMode}` : "",
  ].filter(Boolean);
  if (failures.length) throw new Error(`独立测试基线不真实：${failures.join("；")}`);
}

function summarizeCalls(calls: AnyRecord[], messages: AgentMessage[]) {
  const results = messages.flatMap((message) => {
    if (message.role !== "toolResult" || message.toolName !== "apply_resume_content") return [];
    const raw = message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("");
    try { return [JSON.parse(raw) as AnyRecord]; } catch { return [{}]; }
  });
  return calls.map((call, index) => ({
    expectedRevision: call.expectedRevision,
    targetCount: Array.isArray(call.tailRepairs) ? call.tailRepairs.length : 0,
    revisedTexts: Array.isArray(call.tailRepairs)
      ? call.tailRepairs.map((entry: AnyRecord) => ({
          bulletId: entry.bulletId, revisedText: entry.revisedText,
        })) : [],
    resultRevision: results[index]?.revision ?? null,
    nextMode: results[index]?.nextAction?.mode ?? null,
    appliedCount: results[index]?.tailRepairDiagnostics?.appliedTargetCount ?? null,
    remainingTailCount: results[index]?.nextAction?.remainingTailCount ?? null,
    rejectedReasons: Array.isArray(results[index]?.tailRepairFeedback)
      ? results[index].tailRepairFeedback.filter((entry: AnyRecord) =>
          entry.status === "rejected"
        ).map((entry: AnyRecord) => entry.reason) : [],
  }));
}

function toolCalls(messages: AgentMessage[], name: string): AnyRecord[] {
  return messages.flatMap((message) => message.role === "assistant"
    ? message.content.flatMap((part) =>
        part.type === "toolCall" && part.name === name
          ? [part.arguments as AnyRecord]
          : []
      )
    : []);
}

function resultText(result: { content: readonly { type: string; text?: string }[] }): AnyRecord {
  return JSON.parse(String(result.content[0]?.text ?? "{}")) as AnyRecord;
}
