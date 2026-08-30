import type { Agent } from "@earendil-works/pi-agent-core";
import type { StreamFn } from "@earendil-works/pi-agent-core";

import { wrapInternalPrompt } from "./internal-prompt.js";
import type { CooltoAgentOptions } from "./coolto-agent-types.js";
import type { TurnGovernor } from "./turn-governor.js";

const BASE_RECOVERY =
  "上一条模型响应因长时间没有工具推进而被中止。不要复述已删除的分析。若下方权威状态仍给出与用户当前指令一致的安全工具动作，第一项输出必须是一次批量工具调用，禁止先输出可见计划；若没有安全动作，保留当前最好结果并结束恢复。运行保护本身不得产生新的用户问题；只有原任务无法执行、用户未拒绝追问且缺失信息无法合理判断时，才提出一个不超过100字的必要问题。";

export function recoveryRequiresToolCall(authority?: string): boolean {
  return Boolean(authority?.includes("第一项输出必须是工具调用"));
}

export function recoveryStreamOptions(
  options: Parameters<StreamFn>[2],
  requireToolCall: boolean,
): Parameters<StreamFn>[2] {
  return requireToolCall
    ? { ...options, toolChoice: "required" } as Parameters<StreamFn>[2]
    : options;
}

/** Runs one guided recovery without persisting the host-only user message. */
export async function recoverFromOutputRepetition(
  agent: Agent,
  authority?: string,
): Promise<void> {
  const insertionIndex = agent.state.messages.length;
  try {
    await agent.prompt(wrapInternalPrompt([
      BASE_RECOVERY,
      authority?.trim() || "严格复用最近工具回执中的 nextAction。",
    ].join("\n")));
  } finally {
    const messages = agent.state.messages;
    if (messages[insertionIndex]?.role === "user") {
      agent.state.messages = [
        ...messages.slice(0, insertionIndex),
        ...messages.slice(insertionIndex + 1),
      ];
    }
  }
}

export async function recoverFromTurnGovernor(
  agent: Agent,
  governor: TurnGovernor | undefined,
  recovery: CooltoAgentOptions["turnGovernorRecovery"],
  promptSequence: number,
): Promise<void> {
  const reason = governor?.stopReason;
  if (!reason || !recovery) return;
  const authority = recovery(promptSequence, reason);
  if (!authority) return;
  governor.reset();
  await recoverFromOutputRepetition(agent, authority);
}
