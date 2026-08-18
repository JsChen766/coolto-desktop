import type { Agent } from "@earendil-works/pi-agent-core";

import { wrapInternalPrompt } from "./internal-prompt.js";

const REPETITION_RECOVERY = wrapInternalPrompt(
  "上一条模型响应因长时间没有工具推进而被中止。不要复述已删除的分析。你的第一项输出必须是依据最近 nextAction 的一次批量工具调用，禁止先输出计划、比较或解释；若没有可忠实写入的事实，只用不超过100字询问用户一个必要问题。",
);

/** Runs one guided recovery without persisting the host-only user message. */
export async function recoverFromOutputRepetition(agent: Agent): Promise<void> {
  const insertionIndex = agent.state.messages.length;
  try {
    await agent.prompt(REPETITION_RECOVERY);
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
