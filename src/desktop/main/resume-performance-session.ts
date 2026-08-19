import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";

import type { CooltoAgentEvent } from "../../agent/events.js";
import { createCooltoAgent } from "../../agent/create-agent.js";
import { createConfiguredModelDependencies } from "../../agent/create-configured-dependencies.js";
import { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { AppConfig } from "../../config.js";
import {
  ResumeGenerationTraceStore,
  summarizeTrace,
} from "../../resume/performance/generation-trace-store.js";
import { TracedResumeCompiler } from "../../resume/performance/traced-compiler.js";
import { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { createToolRegistry } from "../../tools/registry.js";
import {
  exportQualifiedPdf,
  qualitySnapshot,
  syntheticProfile,
  type PerformanceRun,
} from "./resume-performance-quality.js";
import type { ElectronResumeCompilerService } from "./resume-compiler-service.js";

const MAX_MODEL_CALLS = 40;
export interface PerformanceManifest {
  runLabel: string;
  experienceIds: string[];
  jdIds: Record<string, string>;
  samples: Array<{
    id: string;
    language: "zh-CN" | "en-US";
    experienceIndexes: number[];
  }>;
}


export async function runPerformanceSession(
  client: CooltoApiClient,
  compiler: ElectronResumeCompilerService,
  config: AppConfig,
  manifest: PerformanceManifest,
  sample: PerformanceManifest["samples"][number],
  iteration: number,
): Promise<PerformanceRun> {
  const conversationId = `resume-perf-${randomUUID()}`;
  const traces = new ResumeGenerationTraceStore();
  const workspaceStore = new ResumeWorkspaceStore();
  const tracedCompiler = new TracedResumeCompiler(compiler, traces, conversationId);
  const sourceBuilder = new ResumeSourceSnapshotBuilder({
    currentUser: client,
    profile: { getUserProfile: async () => syntheticProfile() },

    jd: client,
    experience: client,
  });
  const modelDependencies = createConfiguredModelDependencies(
    config,
    () => client.getSessionToken(),
  );
  const agent = createCooltoAgent({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    modelId: config.modelId,
    thinkingLevel: config.thinkingLevel,
    tools: createToolRegistry({
      currentUserReader: client,
      userProfileReader: { getUserProfile: async () => syntheticProfile() },
      experienceReader: client,
      jdReader: client,
      agentOrchestrated: {
        snapshotBuilder: sourceBuilder,
        compiler: tracedCompiler,
        store: workspaceStore,
      },
    }),
  }, modelDependencies);
  traces.start(conversationId, config.modelId);
  let error: string | null = null;
  const toolSequence: string[] = [];
  let failedToolCount = 0;
  let modelCallCount = 0;
  let aborted = false;
  agent.subscribe(async (event) => {
    await recordTraceEvent(traces, conversationId, event);
    if (event.type === "tool.started") toolSequence.push(event.name);
    if (event.type === "tool.completed") {
      if (event.isError) failedToolCount += 1;
      if (!event.isError) {
        await recordWorkspaceDebug(workspaceStore.latest());
      }
    }
  });
  try {
    agent.subscribe(async (event) => {
      if (event.type === "model.started") {
        modelCallCount += 1;
        if (modelCallCount > MAX_MODEL_CALLS) {
          aborted = true;
          agent.cancel();
        }
      }
    });
    await agent.prompt(promptFor(manifest, sample));
  } catch (caught: unknown) {
    if (!aborted) error = caught instanceof Error ? caught.message : String(caught);
  }
  if (aborted) {
    error = `Aborted after ${MAX_MODEL_CALLS} model calls (run cap)`;
  }
  const failedToolErrors = agent
    .getMessages()
    .flatMap((message) =>
      message.role === "toolResult" && message.isError
        ? [
            {
              name: message.toolName,
              message: message.content
                .flatMap((content) => (content.type === "text" ? [content.text] : []))
                .join("")
                .slice(0, 240),
            },
          ]
        : [],
    );
  const workspace = workspaceStore.latest();
  if (workspace?.status === "ready_for_approval") {
    traces.recordDraftSaved(conversationId);
    traces.recordQualifiedPreviewDelivered(conversationId);
    await exportQualifiedPdf(compiler, workspace, sample.id, iteration);
  }
  const trace = traces.finish(conversationId, {
    workspaceStatus: workspace?.status ?? null,
    failed: error !== null,
  });
  if (!trace) throw new Error("Section F QA did not record a generation trace");
  const summary = summarizeTrace(trace);
  return {
    sampleId: sample.id,
    iteration,
    elapsedMs: summary.elapsedMs,
    modelCallCount: summary.modelCallCount,
    compileCount: summary.compileCount,
    repairRoundCount: summary.repairRoundCount,
    status: workspace?.status ?? null,
    qualifiedPreviewDelivered: summary.qualifiedPreviewDelivered,
    error: error?.slice(0, 240) ?? null,
    stageDurationsMs: summary.stageDurationsMs,
    failedToolCount,
    toolSequence,
    failedToolErrors,
    modelUsage: summary.modelUsage,
    quality: workspace ? qualitySnapshot(workspace) : null,
  };
}

async function recordTraceEvent(
  traces: ResumeGenerationTraceStore,
  conversationId: string,
  event: CooltoAgentEvent,
): Promise<void> {
  const debugPath = process.env.COOLTO_RESUME_PERF_DEBUG_PATH;
  if (debugPath) await appendFile(debugPath, `${debugLabel(event)}\n`);
  if (event.type === "model.started") traces.recordModelStarted(conversationId);
  if (event.type === "model.completed") {
    traces.recordModelCompleted(
      conversationId,
      event.isError ? "error" : "success",
      event.usage,
    );
  }
  if (event.type === "tool.started") {
    traces.recordToolStarted(conversationId, event.callId, event.name);
  }
  if (event.type === "tool.completed") {
    traces.recordTool(conversationId, event.callId, event.name, event.isError ? "error" : "success");
  }
}

function debugLabel(event: CooltoAgentEvent): string {
  if (event.type === "tool.started" || event.type === "tool.completed") {
    const outcome = event.type === "tool.completed" ? `:${event.isError ? "error" : "ok"}` : "";
    return `${event.type}:${event.name}${outcome}`;
  }
  return event.type;
}

async function recordWorkspaceDebug(
  workspace: ReturnType<ResumeWorkspaceStore["latest"]>,
): Promise<void> {
  const debugPath = process.env.COOLTO_RESUME_PERF_DEBUG_PATH;
  if (!debugPath || !workspace) return;
  await appendFile(
    debugPath,
    `workspace:${workspace.status}:bindings=${workspace.bindings.length}:usage=${workspace.compileResult.usageRatio}\n`,
  );
}

function promptFor(
  manifest: PerformanceManifest,
  sample: PerformanceManifest["samples"][number],
): string {
  const experienceIds = sample.experienceIndexes.map((index) => manifest.experienceIds[index]);
  return `请基于目标 JD ${manifest.jdIds[sample.id]} 和以下按顺序选择的经历生成一页${sample.language}简历：${experienceIds.join("、")}。必须先锁定 source snapshot；所有 bullet 都要使用 availableEvidence 返回的 evidenceId 引用证据，不要自行构造或计算偏移量；布局合格后必须完成质量审查及必要修复；最终只在 ready_for_approval 或 needs_user_decision 时停止；不要保存简历。`;
}
