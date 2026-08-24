import type { ConversationAgentContext } from "./agent-runtime-context.js";
import { maybeCompactAgentContext } from "./context-compaction.js";

export async function compactBeforeAgentPrompt(
  context: ConversationAgentContext,
  threshold: () => Promise<number | undefined>,
): Promise<void> {
  const thresholdTokens = await threshold().catch(() => undefined);
  await maybeCompactAgentContext(context.agent, {
    ...context.compaction,
    ...(thresholdTokens === undefined ? {} : { thresholdTokens }),
  }).catch(() => false);
}
