import type { AgentPromptInput } from "../shared/types.js";

/**
 * Renderer prompts never select an agent domain.  Keep the allowlist explicit
 * so stale or hostile renderer payloads cannot smuggle a context authority
 * through IPC; managed task context is derived by the host controller.
 */
export function sanitizeAgentPromptInput(input: AgentPromptInput): AgentPromptInput {
  return {
    conversationId: input.conversationId,
    text: input.text,
    ...(input.resumeReference ? { resumeReference: input.resumeReference } : {}),
    ...(input.jdReference ? { jdReference: input.jdReference } : {}),
    ...(input.usageContext ? { usageContext: input.usageContext } : {}),
  };
}
