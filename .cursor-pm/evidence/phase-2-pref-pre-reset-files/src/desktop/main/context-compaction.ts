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
const PROFILE_PREFERENCE_TOOLS = new Set([
  "get_user_profile", "prepare_profile_update", "get_preferences",
  "resolve_preferences", "prepare_preference_change", "get_preference_suggestions",
]);
export const PROFILE_PREFERENCE_COMPACTION_MARKER = "Profile/Preference context expired; read the current local projection again.";

export interface ProfilePreferenceCompactionAuthority {
  profileVersion: number;
  resolutionHash: string;
}

export interface CompactionDependencies {
  models?: Models;
  model?: Model<Api>;
  thresholdTokens?: number;
  profilePreferenceAuthority?: ProfilePreferenceCompactionAuthority;
}

export interface ContextCompactionBudget {
  thresholdTokens: number;
  keepRecentTokens: number;
  summaryTokens: number;
}

export function contextCompactionBudget(
  model: Model<Api>,
  serverPromptLimit?: number,
): ContextCompactionBudget {
  const modelInputCapacity = Math.max(MIN_INPUT_BUDGET, model.contextWindow - model.maxTokens);
  const serverCapacity = serverPromptLimit && serverPromptLimit > 0 ? serverPromptLimit : modelInputCapacity;
  const inputCapacity = Math.min(modelInputCapacity, serverCapacity);
  const thresholdTokens = Math.max(MIN_INPUT_BUDGET, Math.floor(inputCapacity * INPUT_HEADROOM_RATIO));
  return {
    thresholdTokens, keepRecentTokens: Math.floor(thresholdTokens * RECENT_TAIL_RATIO),
    summaryTokens: Math.min(SUMMARY_TOKENS, Math.floor(thresholdTokens * 0.1)),
  };
}

export async function maybeCompactAgentContext(
  agent: CooltoAgent,
  deps: CompactionDependencies,
): Promise<boolean> {
  if (!deps.models || !deps.model) return false;
  const budget = contextCompactionBudget(deps.model, deps.thresholdTokens);
  const messages = agent.getMessages();
  const estimate = estimateContextTokens(messages);
  if (estimate.tokens < budget.thresholdTokens) return false;
  const safeMessages = redactProfilePreferenceMessages(messages, deps.profilePreferenceAuthority);
  const summary = await generateSummary(safeMessages, deps.models, deps.model, budget.summaryTokens);
  if (summary.ok === false || !summary.value) return false;
  const kept = retainAuthoritativeTail(safeMessages, budget.keepRecentTokens);
  agent.replaceMessages([{
    role: "compactionSummary", summary: summary.value,
    tokensBefore: estimate.tokens, timestamp: Date.now(),
  }, ...kept]);
  return true;
}

export function redactProfilePreferenceMessages(
  messages: readonly AgentMessage[],
  authority?: ProfilePreferenceCompactionAuthority,
): AgentMessage[] {
  const marker = profilePreferenceCompactionMarker(authority);
  return messages.map((message) => {
    if (message.role === "toolResult" && PROFILE_PREFERENCE_TOOLS.has(message.toolName)) {
      const { details: _details, ...safe } = structuredClone(message);
      return {
        ...safe,
        content: [{ type: "text", text: JSON.stringify({
          transient: true, toolName: message.toolName, instruction: marker,
        }) }],
      } as AgentMessage;
    }
    if (message.role !== "assistant") return structuredClone(message);
    return {
      ...structuredClone(message),
      content: message.content.map((part) => part.type === "toolCall" && PROFILE_PREFERENCE_TOOLS.has(part.name)
        ? { ...part, arguments: { transient: true, toolName: part.name, instruction: marker } }
        : structuredClone(part)),
    } as AgentMessage;
  });
}

export function profilePreferenceCompactionMarker(
  authority?: ProfilePreferenceCompactionAuthority,
): string {
  const profileVersion = authority?.profileVersion ?? "unknown";
  const resolutionHash = authority?.resolutionHash ?? "unknown";
  return `${PROFILE_PREFERENCE_COMPACTION_MARKER} profileVersion=${profileVersion} resolutionHash=${resolutionHash}`;
}

function retainAuthoritativeTail(messages: AgentMessage[], budget: number): AgentMessage[] {
  const protectedIndexes = authoritativeResultIndexes(messages);
  let used = [...protectedIndexes].reduce((total, index) => total + estimateTokens(messages[index]!), 0);
  const keptIndexes = new Set(protectedIndexes);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || keptIndexes.has(index)) continue;
    const tokens = estimateTokens(message);
    if (used + tokens > budget && keptIndexes.size > 0) break;
    used += tokens;
    keptIndexes.add(index);
  }
  return [...keptIndexes].sort((left, right) => left - right).map((index) => messages[index]!);
}

function authoritativeResultIndexes(messages: AgentMessage[]): Set<number> {
  const sourceTools = new Set(["create_resume_workspace"]);
  const workspaceTools = new Set([
    "create_resume_workspace", "get_resume_workspace", "apply_resume_content",
    "add_resume_material", "confirm_no_resume_material", "pause_resume_for_material",
    "decline_resume_material",
  ]);
  let source = -1;
  let workspace = -1;
  let profile = -1;
  let preference = -1;
  let error = -1;
  messages.forEach((message, index) => {
    if (message.role !== "toolResult") return;
    if (sourceTools.has(message.toolName)) source = index;
    if (workspaceTools.has(message.toolName)) workspace = index;
    if (message.toolName === "get_user_profile" || message.toolName === "prepare_profile_update") profile = index;
    if (message.toolName === "get_preferences" || message.toolName === "resolve_preferences" || message.toolName === "prepare_preference_change") preference = index;
    if (message.isError) error = index;
  });
  return new Set([source, workspace, profile, preference, error].filter((index) => index >= 0));
}
