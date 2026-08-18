import { appendFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { stdout } from "node:process";

import type { CooltoAgent } from "../agent/coolto-agent.js";
import type { ResumeCompiler } from "../resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from "../resume/workspace/workspace-store.js";

const AUTO_APPROVE_LOG = "local-output/approvals.log";
const INITIAL_PROMPT_MAX_MS = 210_000;
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
  const initialPromptMaxMs = unlimited
    ? Number.POSITIVE_INFINITY
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
      `\n[预算] 本次 Agent 运行超过 ${initialPromptMaxMs / 1000}s，已停止。\n`,
    );
  }
  while (input.agent.isRunning) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (input.autoApprove) {
    await autoApproveUntilSettled(input.agent);
  }
  await dumpResumeIfRequested(input.dumpResume, input.store);
}

async function autoApproveUntilSettled(agent: CooltoAgent): Promise<void> {
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
    return;
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
