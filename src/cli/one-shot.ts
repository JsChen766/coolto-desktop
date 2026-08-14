import { appendFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { stdout } from "node:process";

import type { CooltoAgent } from "../agent/coolto-agent.js";
import {
  continueUntilTerminal,
  INITIAL_TURN_MAX_MS,
  UNLIMITED_CONTINUATION_BUDGET,
} from "../desktop/main/resume-continuation.js";
import type { ResumeCompiler } from "../resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from "../resume/workspace/workspace-store.js";

const AUTO_APPROVE_LOG = "local-output/approvals.log";
const INITIAL_PROMPT_MAX_MS = 210_000;
const MAX_CONTINUATION_MODEL_CALLS = 40;
const DEFAULT_MAX_MINUTES = 5;

export interface CliOneShotInput {
  agent: CooltoAgent;
  store: ResumeWorkspaceStore;
  compiler: ResumeCompiler;
  prompt: string;
  autoApprove: boolean;
  noTimeout: boolean;
  maxMinutes: number | undefined;
  dumpResume: string | undefined;
}

export async function runCliOneShot(input: CliOneShotInput): Promise<void> {
  const unlimited = input.noTimeout;
  const maxMs = unlimited
    ? Number.POSITIVE_INFINITY
    : (input.maxMinutes ?? DEFAULT_MAX_MINUTES) * 60_000;
  const startedAtMs = performance.now();
  const continuationMaxMs = unlimited
    ? Number.POSITIVE_INFINITY
    : Math.max(60_000, maxMs - 30_000);
  const initialPromptMaxMs = unlimited
    ? INITIAL_TURN_MAX_MS
    : INITIAL_PROMPT_MAX_MS;
  const unsubscribeBudget = input.agent.subscribe((event) => {
    if (
      event.type === "model.started" &&
      performance.now() - startedAtMs >= initialPromptMaxMs
    ) {
      input.agent.cancel();
    }
  });
  await input.agent.prompt(input.prompt);
  unsubscribeBudget();
  if (performance.now() - startedAtMs >= initialPromptMaxMs) {
    stdout.write(
      `\n[预算] 初始回合超过 ${initialPromptMaxMs / 1000}s，已截断并转入续跑。\n`,
    );
  }
  while (input.agent.isRunning) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const budget = {
    ...(unlimited ? UNLIMITED_CONTINUATION_BUDGET : {}),
    maxMs: continuationMaxMs,
    startedAtMs,
    maxModelCalls: unlimited
      ? UNLIMITED_CONTINUATION_BUDGET.maxModelCalls
      : MAX_CONTINUATION_MODEL_CALLS,
  };
  if (input.autoApprove) {
    await autoApproveUntilTerminal(input.agent, input.store, input.compiler, budget);
  } else {
    await continueUntilTerminal(
      input.agent,
      input.store,
      input.compiler,
      budget,
      { log: (line) => void stdout.write(`[续跑] ${line}\n`) },
    );
  }
  await dumpResumeIfRequested(input.dumpResume, input.store);
}

async function autoApproveUntilTerminal(
  agent: CooltoAgent,
  store: ResumeWorkspaceStore,
  compiler: ResumeCompiler,
  budget: { maxMs: number; startedAtMs: number; maxModelCalls: number },
): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    const request = agent.getPendingApprovals()[0];
    if (request) {
      stdout.write(`\n[自动接受审批] ${request.title}\n${request.description}\n`);
      for (const field of request.preview.summary) {
        stdout.write(`- ${field.label}：${field.value}\n`);
      }
      for (const field of request.preview.profileFields ?? []) {
        stdout.write(
          `- ${field.label}：${field.currentValue ?? "（未填写）"} → ${field.proposedValue}\n`,
        );
      }
      const logLine = JSON.stringify({
        at: new Date().toISOString(),
        actionType: request.actionType,
        risk: request.risk,
        title: request.title,
        description: request.description,
        summary: request.preview.summary,
      });
      await appendFile(AUTO_APPROVE_LOG, `${logLine}\n`).catch(() => undefined);
      await agent.resolveApproval(request.id, { type: "accept" });
      stdout.write("Agent> ");
      await agent.prompt("请继续完成你的任务，无需等待确认。");
      continue;
    }
    await continueUntilTerminal(agent, store, compiler, budget, {
      log: (line) => void stdout.write(`[续跑] ${line}\n`),
    });
    if (agent.getPendingApprovals().length === 0) return;
  }
  stdout.write("\n[auto-approve] 达到轮次上限，已停止。\n");
}

async function dumpResumeIfRequested(
  dumpResume: string | undefined,
  store: ResumeWorkspaceStore,
): Promise<void> {
  if (!dumpResume) return;
  const workspace = store.latest();
  if (!workspace) {
    stdout.write("本次会话没有生成简历草稿（workspace 为空）。\n");
    return;
  }
  const payload = {
    status: workspace.status,
    revision: workspace.revision,
    usageRatio: workspace.compileResult.usageRatio,
    structure: workspace.structure,
  };
  await writeFile(dumpResume, JSON.stringify(payload, null, 2));
  stdout.write(
    `\n简历草稿已导出：${dumpResume}（status=${workspace.status}，usageRatio=${workspace.compileResult.usageRatio.toFixed(3)}）\n`,
  );
  stdout.write(
    `导出 PDF：npm run pdf:export -- --structure ${dumpResume} --out local-output/resume.pdf\n`,
  );
}
