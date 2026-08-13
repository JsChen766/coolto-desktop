import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import { createConfiguredModelDependencies } from "../src/agent/create-configured-dependencies.js";
import { CooltoApiClient } from "../src/api/coolto-api-client.js";
import { KeychainSessionStore } from "../src/auth/keychain-session-store.js";
import { ensureAuthenticated } from "../src/auth/session-manager.js";
import { loadLocalEnv, readConfig } from "../src/config.js";
import { ResumeAlternativeRepairer } from "../src/resume/quality/alternative-repairer.js";
import { ResumeCandidateReviewer } from "../src/resume/quality/candidate-reviewer.js";
import { ResumeQualityEvaluator } from "../src/resume/quality/quality-evaluator.js";
import { ResumeCandidatePatcher } from "../src/resume/workspace/candidate-patcher.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createToolRegistry } from "../src/tools/registry.js";
import { performEmailOtpLogin } from "../src/cli/login.js";
import {
  createSemanticEvalBuilder,
  semanticEvalCases,
  type SemanticEvalCase,
} from "./support/resume-agent-eval-fixtures.js";
import { SemanticEvalCompiler } from "./support/semantic-eval-compiler.js";

loadLocalEnv();
const config = readConfig();
const apiClient = new CooltoApiClient({ baseUrl: config.apiBaseUrl });
const sessionStore = new KeychainSessionStore({ apiBaseUrl: config.apiBaseUrl });
const authenticated = await ensureAuthenticated(
  apiClient,
  sessionStore,
  config.apiBaseUrl,
  performEmailOtpLogin,
);
const modelDependencies = createConfiguredModelDependencies(
  config,
  () => apiClient.getSessionToken(),
);
const reports = [];
const selectedCase = process.env.COOLTO_RESUME_AGENT_EVAL_CASE;

for (const evalCase of semanticEvalCases().filter(
  (evalCase) => !selectedCase || evalCase.id === selectedCase,
)) {
  reports.push(await runCase(evalCase));
}

const summary = {
  passed: reports.every((report) => report.passed),
  modelId: config.modelId,
  caseCount: reports.length,
  passedCaseCount: reports.filter((report) => report.passed).length,
  totalInputTokens: sum(reports.map((report) => report.usage.input)),
  totalOutputTokens: sum(reports.map((report) => report.usage.output)),
  totalTokens: sum(reports.map((report) => report.usage.totalTokens)),
  totalDurationMs: sum(reports.map((report) => report.durationMs)),
  reports,
};

const outputPath = process.env.COOLTO_RESUME_AGENT_EVAL_RESULT_PATH;
if (outputPath) {
  const absolutePath = resolve(outputPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(summary, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (!summary.passed) process.exitCode = 1;

async function runCase(evalCase: SemanticEvalCase) {
  const builder = createSemanticEvalBuilder(evalCase);
  const compiler = new SemanticEvalCompiler();
  const store = new ResumeWorkspaceStore();
  const evaluator = new ResumeQualityEvaluator();
  const patcher = new ResumeCandidatePatcher(compiler, store);
  const reviewer = new ResumeCandidateReviewer(evaluator, store);
  const repairer = new ResumeAlternativeRepairer(compiler, evaluator, store);
  const agent = createCooltoAgent(
    {
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      modelId: config.modelId,
      tools: createToolRegistry({
        resumeSourceSnapshotBuilder: builder,
        resumeCandidatePatcher: patcher,
        resumeCandidateReviewer: reviewer,
        resumeAlternativeRepairer: repairer,
        agentOrchestrated: {
          snapshotBuilder: builder,
          compiler,
          store,
          reviewer,
        },
      }),
    },
    modelDependencies,
  );
  const startedAt = performance.now();
  let runtimeError: string | undefined;
  try {
    await agent.prompt(promptFor(evalCase));
  } catch (error: unknown) {
    runtimeError = error instanceof Error ? error.message : String(error);
  }
  const durationMs = Number((performance.now() - startedAt).toFixed(2));
  const messages = agent.getMessages();
  const usage = summarizeUsage(messages);
  const assistantErrors = messages.flatMap((message) =>
    message.role === "assistant" && message.stopReason === "error"
      ? [message.errorMessage ?? "模型调用失败"]
      : [],
  );
  const finalResponse = messages
    .filter((message) => message.role === "assistant")
    .at(-1)
    ?.content.flatMap((content) =>
      content.type === "text" ? [content.text] : [],
    )
    .join("") ?? "";
  const toolFailures = messages.flatMap((message) =>
    message.role === "toolResult" && message.isError
      ? [{
          name: message.toolName,
          message: message.content
            .flatMap((content) => content.type === "text" ? [content.text] : [])
            .join("")
            .slice(0, 500),
        }]
      : [],
  );
  let workspace;
  try {
    workspace = store.latest();
  } catch {
    workspace = undefined;
  }
  const bulletText = workspace
    ? workspace.structure.sections
        .flatMap((section) => section.items)
        .flatMap((item) => item.bullets)
        .map((bullet) => bullet.text)
        .join("\n")
    : "";
  const toolNames = toolCalls(messages);
  const assertions = {
    noRuntimeError: runtimeError === undefined && assistantErrors.length === 0,
    workspaceCreated: workspace !== undefined,
    expectedStatus: workspace?.status === evalCase.expectedStatus,
    evidenceBound: Boolean(
      workspace &&
        workspace.bindings.length > 0 &&
        workspace.bindings.length ===
          workspace.structure.sections.flatMap((section) =>
            section.items.flatMap((item) => item.bullets),
          ).length,
    ),
    noForbiddenClaim: evalCase.forbiddenTerms.every(
      (term) => !bulletText.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
    ),
    usedSnapshot: toolNames.includes("get_resume_source_snapshot"),
    usedDraft: toolNames.includes("prepare_resume_draft"),
    usedWriteOrPatch: (
      toolNames.includes("write_bullet") ||
      toolNames.includes("patch_resume_candidate")
    ),
    respectedRepairLimit: (workspace?.repairRound ?? 0) <= 3,
  };
  const passed = Object.values(assertions).every(Boolean);
  return {
    id: evalCase.id,
    passed,
    expectedStatus: evalCase.expectedStatus,
    actualStatus: workspace?.status ?? null,
    revision: workspace?.revision ?? null,
    repairRound: workspace?.repairRound ?? null,
    bulletCount: workspace?.bindings.length ?? 0,
    compileCount: compiler.compileCount,
    toolNames,
    usage,
    durationMs,
    assertions,
    runtimeError: runtimeError ?? null,
    assistantErrors,
    toolFailures,
    finalResponse,
    remainingIssues:
      workspace?.qualityReport?.issues.map((issue) => issue.code) ?? [],
  };
}

function promptFor(evalCase: SemanticEvalCase): string {
  const ids = evalCase.experiences.map((experience) => experience.id).join(", ");
  return `请完成一次受控简历语义评测。目标 JD ID 是 ${evalCase.jd.id}，按顺序使用经历 ${ids}，语言为 ${evalCase.language}。必须先读取 source snapshot，查看布局预算后自行决策布局，再并行逐条写入证据绑定的 bullets（数字、技术、结果必须逐字来自证据），达到 layout_qualified 后由程序自动质量 review 并持续进行允许的局部修复，直到 ready_for_approval 或 needs_user_decision。不得编造来源中不存在的数字、技术、结果或责任级别；不得声称保存。完成后只简短报告最终状态。`;
}

function summarizeUsage(messages: AgentMessage[]) {
  const assistant = messages.filter(
    (message): message is AgentMessage & { usage: Record<string, number> } =>
      message.role === "assistant" && "usage" in message,
  );
  return {
    input: sum(assistant.map((message) => Number(message.usage.input ?? 0))),
    output: sum(assistant.map((message) => Number(message.usage.output ?? 0))),
    totalTokens: sum(
      assistant.map((message) => Number(message.usage.totalTokens ?? 0)),
    ),
    modelCalls: assistant.length,
  };
}

function toolCalls(messages: AgentMessage[]): string[] {
  return messages.flatMap((message) =>
    message.role === "assistant"
      ? message.content.flatMap((content) =>
          content.type === "toolCall" ? [content.name] : [],
        )
      : [],
  );
}

function sum(values: number[]): number {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(2));
}
