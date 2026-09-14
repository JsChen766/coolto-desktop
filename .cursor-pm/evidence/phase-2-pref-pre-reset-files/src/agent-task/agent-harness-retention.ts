import type { AgentHarnessStateV1 } from "./agent-harness-state.js";

const ACTION_RECEIPT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function pruneAgentHarnessState(
  state: AgentHarnessStateV1,
  now = Date.now(),
): void {
  const receiptCutoff = now - ACTION_RECEIPT_RETENTION_MS;
  const retainedReceipts = state.actionReceipts.filter((receipt) =>
    Date.parse(receipt.createdAt) >= receiptCutoff,
  );
  const retainedReceiptIds = new Set(retainedReceipts.map((receipt) => receipt.id));
  state.actionReceipts = retainedReceipts;
  state.actionTokens = state.actionTokens.filter((token) =>
    token.receiptId
      ? retainedReceiptIds.has(token.receiptId)
      : Date.parse(token.expiresAt) >= now,
  );
  state.policyDecisions = state.policyDecisions.filter((decision) =>
    Date.parse(decision.decidedAt) >= receiptCutoff,
  );
  state.stageTransitions = (state.stageTransitions ?? []).filter((transition) =>
    Date.parse(transition.createdAt) >= receiptCutoff,
  );
  state.preferenceSuppressions = state.preferenceSuppressions.filter((entry) =>
    Date.parse(entry.expiresAt) >= now,
  );
  state.preferenceSuggestions = state.preferenceSuggestions.filter((suggestion) =>
    Date.parse(suggestion.expiresAt) >= now,
  );
  state.preferenceUsage = state.preferenceUsage.filter((usage) =>
    usage.lastUsedAt === null || Date.parse(usage.lastUsedAt) >= receiptCutoff,
  );
}
