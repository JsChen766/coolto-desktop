import type { ToolCapabilityMetadataV1 } from "../agent-task/tool-capability-types.js";

const READ_SCOPES: Record<string, string> = {
  get_user_profile: "profile.read",
  get_preferences: "preference.read",
  resolve_preferences: "preference.resolve",
};
const WRITE_SCOPES: Record<string, string> = {
  prepare_profile_update: "profile.write",
  prepare_preference_change: "preference.write",
};

export function profilePreferenceCapability(
  toolName: string,
): ToolCapabilityMetadataV1 | undefined {
  const readScope = READ_SCOPES[toolName];
  if (readScope) return metadata(readScope, true);
  const writeScope = WRITE_SCOPES[toolName];
  return writeScope ? metadata(writeScope, false) : undefined;
}

function metadata(scope: string, read: boolean): ToolCapabilityMetadataV1 {
  return {
    sideEffect: read ? "read" : "reversible", risk: read ? "R0" : "R1",
    requiredScopes: [scope], concurrency: read ? "parallel" : "sequential",
    idempotency: read ? "none" : "request_key", evidence: read ? "none" : "action_receipt",
    requiresFreshObservation: false, unattendedAllowed: true,
  };
}
