import { canonicalHash } from "./canonical-hash.js";
import type { DelegationGrantV1 } from "./grant-types.js";
import type { JsonValue } from "./json-types.js";
import { uuidV7 } from "./uuid-v7.js";
import { normalizeStagePolicy } from "./stage-policy.js";

export type DelegationGrantDraft = Omit<
  DelegationGrantV1,
  "version" | "id" | "contentHash"
>;

export function createDelegationGrant(
  input: DelegationGrantDraft,
  id = uuidV7(),
): DelegationGrantV1 {
  const validFrom = Date.parse(input.validFrom);
  const expiresAt = Date.parse(input.expiresAt);
  if (!Number.isFinite(validFrom) || !Number.isFinite(expiresAt) ||
      validFrom >= expiresAt) {
    throw new Error("DelegationGrant expiresAt 必须晚于 validFrom");
  }
  const stagePolicy = input.stagePolicy
    ? normalizeStagePolicy(input.stagePolicy, input.allowedActions)
    : undefined;
  const grant = {
    version: 1 as const,
    id,
    ...structuredClone(input),
    ...(stagePolicy ? { stagePolicy } : {}),
    validFrom: new Date(validFrom).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    allowedDomains: normalizeDomains(input.allowedDomains),
    blockedDomains: normalizeDomains(input.blockedDomains),
    allowedActions: [...new Set(input.allowedActions.map((value) => value.trim()))]
      .filter(Boolean).sort(),
  };
  return { ...grant, contentHash: canonicalHash(grant as unknown as JsonValue) };
}

export function verifyDelegationGrant(grant: DelegationGrantV1): boolean {
  const { contentHash: _hash, ...content } = grant;
  return canonicalHash(content as unknown as JsonValue) === grant.contentHash;
}

function normalizeDomains(values: string[]): string[] {
  return [...new Set(values.map((value) => {
    const domain = value.trim().toLowerCase().replace(/^\*\./u, "");
    if (!domain || domain.includes("/") || domain.includes(":")) {
      throw new Error(`无效授权 domain：${value}`);
    }
    return domain;
  }))].sort();
}
