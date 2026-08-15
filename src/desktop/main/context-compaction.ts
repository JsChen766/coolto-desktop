import type {
  AgentMessage,
  Models,
  Model,
  Api,
} from "@earendil-works/pi-agent-core";
import {
  estimateContextTokens,
  estimateTokens,
  generateSummary,
} from "@earendil-works/pi-agent-core";
import type { CooltoAgent } from "../../agent/coolto-agent.js";

export const DEFAULT_COMPACTION_THRESHOLD_TOKENS = 200_000;
const RESERVE_TOKENS = 4_000;
const KEEP_RECENT_TOKENS = 60_000;

export interface CompactionDependencies {
  models?: Models;
  model?: Model<Api>;
  /** Threshold from server app-config; falls back to the local default. */
  thresholdTokens?: number;
}

/**
 * Compacts an over-long conversation before the next run: the early history
 * is replaced by an LLM-generated summary while the recent tail is kept.
 * Returns true when a compaction happened. Failures are swallowed by callers
 * so a compaction problem never blocks the conversation itself.
 */
export async function maybeCompactAgentContext(
  agent: CooltoAgent,
  deps: CompactionDependencies,
): Promise<boolean> {
  const threshold = deps.thresholdTokens ?? DEFAULT_COMPACTION_THRESHOLD_TOKENS;
  if (!deps.models || !deps.model) return false;
  const messages = agent.getMessages();
  const estimate = estimateContextTokens(messages);
  if (estimate.tokens < threshold) return false;

  const summary = await generateSummary(
    messages,
    deps.models,
    deps.model,
    RESERVE_TOKENS,
  );
  if (summary.ok === false || !summary.value) return false;

  const kept = retainRecentTail(messages, KEEP_RECENT_TOKENS);
  const summaryMessage: AgentMessage = {
    role: "system",
    content: `以下是早期对话的摘要，供后续继续使用：\n${summary.value}`,
  };
  agent.replaceMessages([summaryMessage, ...kept]);
  return true;
}

/** Keeps the trailing messages that fit the recent-token budget. */
function retainRecentTail(
  messages: AgentMessage[],
  budget: number,
): AgentMessage[] {
  let used = 0;
  const kept: AgentMessage[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    used += estimateTokens(message);
    if (used > budget && kept.length > 0) break;
    kept.unshift(message);
  }
  return kept;
}
