import type { AgentHarnessStateV1 } from "./agent-harness-state.js";

const CORE_ARRAY_FIELDS = [
  "tasks", "runs", "checkpoints", "grants", "revocations",
  "policyDecisions", "events", "actionTokens", "actionReceipts",
] as const;

const EXTENSION_ARRAY_FIELDS = [
  "browserLeads", "leadEvaluations", "jobSourceCursors",
  "submissionIntents", "submissionReceipts", "answerVault",
  "inboxCursors", "externalSignals",
] as const;

/** Adds later V1 extension collections without discarding an older valid V1 file. */
export function normalizeAgentHarnessStateV1(
  value: unknown,
): AgentHarnessStateV1 | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = structuredClone(value) as Partial<AgentHarnessStateV1>;
  if (candidate.version !== 1 || typeof candidate.ownerId !== "string") {
    return undefined;
  }
  if (!CORE_ARRAY_FIELDS.every((field) => Array.isArray(candidate[field]))) {
    return undefined;
  }
  for (const field of EXTENSION_ARRAY_FIELDS) {
    if (candidate[field] === undefined) candidate[field] = [];
    else if (!Array.isArray(candidate[field])) return undefined;
  }
  for (const intent of candidate.submissionIntents ?? []) {
    if (intent && typeof intent === "object" && intent.startedAt === undefined) {
      intent.startedAt = null;
    }
  }
  if (typeof candidate.updatedAt !== "string") {
    candidate.updatedAt = new Date(0).toISOString();
  }
  return candidate as AgentHarnessStateV1;
}
