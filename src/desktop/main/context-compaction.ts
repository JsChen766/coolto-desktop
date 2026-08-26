import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model, Models } from "@earendil-works/pi-ai";
import {
  estimateContextTokens,
  estimateTokens,
  generateSummary,
} from "@earendil-works/pi-agent-core";
import type { CooltoAgent } from "../../agent/coolto-agent.js";

const SUMMARY_TOKENS = 16_000;
const INPUT_HEADROOM_RATIO = 0.9;
const RECENT_TAIL_RATIO = 0.75;
const MIN_INPUT_BUDGET = 16_000;

export interface CompactionDependencies {
  models?: Models;
  model?: Model<Api>;
  /** Threshold from server app-config; falls back to the local default. */
  thresholdTokens?: number;
}

export interface ContextCompactionBudget {
  thresholdTokens: number;
  keepRecentTokens: number;
  summaryTokens: number;
}

/**
 * Derives the budget from the selected model instead of imposing a product
 * a fixed product ceiling. The model's maximum completion is reserved because its
 * context window covers both input and output.
 */
export function contextCompactionBudget(
  model: Model<Api>,
  serverPromptLimit?: number,
): ContextCompactionBudget {
  const modelInputCapacity = Math.max(
    MIN_INPUT_BUDGET,
    model.contextWindow - model.maxTokens,
  );
  const serverCapacity =
    serverPromptLimit && serverPromptLimit > 0
      ? serverPromptLimit
      : modelInputCapacity;
  const inputCapacity = Math.min(modelInputCapacity, serverCapacity);
  const thresholdTokens = Math.max(
    MIN_INPUT_BUDGET,
    Math.floor(inputCapacity * INPUT_HEADROOM_RATIO),
  );
  return {
    thresholdTokens,
    keepRecentTokens: Math.floor(thresholdTokens * RECENT_TAIL_RATIO),
    summaryTokens: Math.min(SUMMARY_TOKENS, Math.floor(thresholdTokens * 0.1)),
  };
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
  if (!deps.models || !deps.model) return false;
  const budget = contextCompactionBudget(deps.model, deps.thresholdTokens);
  const messages = agent.getMessages();
  const estimate = estimateContextTokens(messages);
  if (estimate.tokens < budget.thresholdTokens) return false;

  const summary = await generateSummary(
    messages,
    deps.models,
    deps.model,
    budget.summaryTokens,
  );
  if (summary.ok === false || !summary.value) return false;

  const kept = retainAuthoritativeTail(messages, budget.keepRecentTokens);
  const summaryMessage: AgentMessage = {
    role: "compactionSummary",
    summary: summary.value,
    tokensBefore: estimate.tokens,
    timestamp: Date.now(),
  };
  agent.replaceMessages([summaryMessage, ...kept]);
  return true;
}

/** Keeps the trailing messages that fit the recent-token budget. */
function retainAuthoritativeTail(
  messages: AgentMessage[],
  budget: number,
): AgentMessage[] {
  const protectedIndexes = authoritativeResultIndexes(messages);
  let used = [...protectedIndexes].reduce(
    (total, index) => total + estimateTokens(messages[index]!),
    0,
  );
  const keptIndexes = new Set(protectedIndexes);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    if (keptIndexes.has(index)) continue;
    const tokens = estimateTokens(message);
    if (used + tokens > budget && keptIndexes.size > 0) break;
    used += tokens;
    keptIndexes.add(index);
  }
  return [...keptIndexes]
    .sort((left, right) => left - right)
    .map((index) => messages[index]!);
}

function authoritativeResultIndexes(messages: AgentMessage[]): Set<number> {
  const sourceTools = new Set(["create_resume_workspace"]);
  const workspaceTools = new Set([
    "create_resume_workspace",
    "get_resume_workspace",
    "apply_resume_content",
    "add_resume_material",
    "confirm_no_resume_material",
  ]);
  let source = -1;
  let workspace = -1;
  let error = -1;
  messages.forEach((message, index) => {
    if (message.role !== "toolResult") return;
    if (sourceTools.has(message.toolName)) source = index;
    if (workspaceTools.has(message.toolName)) workspace = index;
    if (message.isError) error = index;
  });
  return new Set([source, workspace, error].filter((index) => index >= 0));
}
