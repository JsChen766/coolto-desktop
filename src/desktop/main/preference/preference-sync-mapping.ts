import { normalizePreference } from "../../../preference/normalizer.js";
import type {
  PreferenceMutationInputV1,
  PreferenceV1,
} from "../../../preference/types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";

export function toPreference(entity: LocalEntity, ownerId: string): PreferenceV1 {
  const payload = {
    ...entity.payload,
    ownerId: entity.payload.ownerId ?? ownerId,
    entityVersion: entity.payload.entityVersion ?? Math.max(entity.entityVersion, 1),
  };
  return normalizePreference(payload);
}

export function toPreferenceMutationPayload(preference: PreferenceV1, ownerId: string): Record<string, unknown> {
  return {
    version: 1, ownerId, key: preference.key, value: structuredClone(preference.value),
    scope: structuredClone(preference.scope), priority: preference.priority,
    conflictGroup: preference.conflictGroup, source: preference.source,
    sourceSuggestionHash: preference.sourceSuggestionHash,
    status: preference.status, ruleVersion: preference.ruleVersion,
  };
}

export function toPreferenceLocalPayload(preference: PreferenceV1): Record<string, unknown> {
  return structuredClone(preference) as unknown as Record<string, unknown>;
}

export function toPreferenceDeletePayload(ownerId: string): Record<string, unknown> {
  return { version: 1, ownerId };
}

export function createPreferenceSnapshot(ownerId: string, id: string, input: PreferenceMutationInputV1, now: string): PreferenceV1 {
  return normalizePreference({
    version: 1, id, ownerId, entityVersion: 1, key: input.key, value: input.value,
    scope: input.scope, priority: input.priority, conflictGroup: input.key,
    source: input.source ?? "explicit_user", sourceSuggestionHash: input.sourceSuggestionHash ?? null,
    status: "active", ruleVersion: ruleVersionFor(input.key), confirmedAt: now,
    createdAt: now, updatedAt: now, deletedAt: null,
  });
}

export function updatePreferenceSnapshot(
  current: PreferenceV1,
  input: Partial<PreferenceMutationInputV1> & { status?: "active" | "disabled" },
  now: string,
): PreferenceV1 {
  const { contentHash: _contentHash, ...base } = current;
  const key = input.key ?? current.key;
  return normalizePreference({
    ...base, key, value: input.value ?? current.value, scope: input.scope ?? current.scope,
    priority: input.priority ?? current.priority, conflictGroup: key,
    source: input.source ?? current.source,
    sourceSuggestionHash: input.sourceSuggestionHash === undefined ? current.sourceSuggestionHash : input.sourceSuggestionHash,
    status: input.status ?? current.status, updatedAt: now, deletedAt: null,
    entityVersion: current.entityVersion + 1,
  });
}

export function deletePreferenceSnapshot(current: PreferenceV1, now: string): PreferenceV1 {
  const { contentHash: _contentHash, ...base } = current;
  return normalizePreference({
    ...base, status: "disabled", deletedAt: now, updatedAt: now,
    entityVersion: current.entityVersion + 1,
  });
}

function ruleVersionFor(key: PreferenceMutationInputV1["key"]): string {
  return {
    "resume.tone": "resume-tone-v1", "resume.bullet_style": "resume-bullet-v1",
    "resume.avoid_terms": "resume-avoid-terms-v1", "job_search.location_priority": "job-location-v1",
    "job_search.work_mode": "job-work-mode-v1",
  }[key];
}
