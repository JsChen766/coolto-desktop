import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import { createConfiguredModelDependencies } from "../src/agent/create-configured-dependencies.js";
import { loadLocalEnv, readConfig } from "../src/config.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createToolRegistry } from "../src/tools/registry.js";
import {
  createSemanticEvalBuilder,
  semanticEvalCases,
  type SemanticEvalCase,
} from "./support/resume-agent-eval-fixtures.js";
import { SemanticEvalCompiler } from "./support/semantic-eval-compiler.js";

loadLocalEnv();
const config = readConfig();
// Open-source path: BYO OpenAI-compatible API only (LLM_API_KEY / OPENAI_API_KEY /
// DEEPSEEK_API_KEY). Do not call Coolto OTP / ensureAuthenticated — that blocked
// non-TTY eval and never reached the model (see commit 03bf676).
if (!config.apiKey?.trim()) {
  throw new Error(
    "eval:resume-agent requires a user-supplied OpenAI-compatible API key. " +
      "Set LLM_API_KEY (or OPENAI_API_KEY / DEEPSEEK_API_KEY) in .env. " +
      "Coolto interactive OTP login is not used for local OSS eval.",
  );
}
const modelDependencies = createConfiguredModelDependencies(
  config,
  () => "",
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
  const agent = createCooltoAgent(
    {
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      modelId: config.modelId,
      tools: createToolRegistry({
        agentOrchestrated: {
          snapshotBuilder: builder,
          compiler,
          store,
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
  const expectsWorkspace = !evalCase.expectsNoWorkspace;
  const assertions = {
    noRuntimeError: runtimeError === undefined && assistantErrors.length === 0,
    workspaceCreated: expectsWorkspace
      ? workspace !== undefined
      : workspace === undefined,
    expectedStatus: expectsWorkspace
      ? workspace?.status === evalCase.expectedStatus
      : true,
    evidenceBound: expectsWorkspace
      ? Boolean(
          workspace &&
            workspace.bindings.length > 0 &&
            workspace.bindings.length ===
              workspace.structure.sections.flatMap((section) =>
                section.items.flatMap((item) => item.bullets),
              ).length,
        )
      : true,
    noForbiddenClaim: evalCase.forbiddenTerms.every(
      (term) => !bulletText.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
    ),
    // Current agent-orchestrated surface (post write_bullet era):
    // create_resume_workspace builds the host snapshot; apply_resume_content writes.
    usedSnapshot: expectsWorkspace
      ? toolNames.includes("create_resume_workspace")
      : true,
    usedDraft: expectsWorkspace
      ? toolNames.includes("create_resume_workspace")
      : true,
    usedWriteOrPatch: expectsWorkspace
      ? toolNames.includes("apply_resume_content")
      : true,
    respectedRepairLimit: (workspace?.repairRound ?? 0) <= 3,
    askedForMaterial: evalCase.expectsNoWorkspace
      ? /补充|新增|完善|提供|经历|素材|材料|Kubernetes/iu.test(finalResponse)
      : true,
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
  if (evalCase.expectsNoWorkspace) {
    return `请完成一次受控简历语义评测。目标 JD ID 是 ${evalCase.jd.id}，候选经历 ${ids || "（无）"}，语言为 ${evalCase.language}。素材不足以生成合规简历时，不要创建工作区；向用户追问补充材料（例如缺失的关键经历/技术），不得编造。完成后只简短说明还缺什么。`;
  }
  return `请完成一次受控简历语义评测。目标 JD ID 是 ${evalCase.jd.id}，按顺序使用经历 ${ids}，语言为 ${evalCase.language}。必须先调用 create_resume_workspace（宿主会读取 source snapshot 与布局预算），再用 apply_resume_content 写入证据绑定内容（数字、技术、结果必须逐字来自证据），达到 layout_qualified 后由程序自动质量 review 并持续局部修复，直到 ready_for_approval 或 needs_user_decision。不得编造来源中不存在的数字、技术、结果或责任级别；不得声称保存。完成后只简短报告最终状态。`;
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
