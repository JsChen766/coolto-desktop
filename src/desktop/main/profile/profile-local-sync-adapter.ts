import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

import type { LocalPayloadMerger } from "../sync/local-sync-types.js";
import {
  careerTargetFingerprint,
  legacyToCareerTargets,
  normalizeCareerTarget,
  type CareerTargetV1,
  targetsToLegacy,
} from "../../../profile/career-targets.js";
import { ProfileTargetIdentityStore } from "./profile-target-identity-store.js";

type IdentityResolver = (fingerprint: string, preferredId?: string) => string;

/** Preserves App-local target identities while remote Profile payloads stay canonical. */
export const mergeProfileLocalPayload: LocalPayloadMerger = (entityType, current, server) =>
  mergeProfilePayload(entityType, current, server, (fingerprint, preferredId) => preferredId ?? randomUUID());

/** Validate the canonical/legacy contract before a remote page can commit. */
export function assertProfileSyncPayload(
  entityType: string,
  payload: Record<string, unknown>,
): void {
  if (entityType !== "user_profile") return;
  if (!Array.isArray(payload.careerTargets) &&
      !["targetRoles", "targetIndustries", "targetLocations"]
        .some((key) => Object.prototype.hasOwnProperty.call(payload, key))) {
    return;
  }
  const targets = readTargets(payload);
  const supplied = {
    targetRoles: payload.targetRoles === undefined ? [] : strings(payload.targetRoles),
    targetIndustries: payload.targetIndustries === undefined ? [] : strings(payload.targetIndustries),
    targetLocations: payload.targetLocations === undefined ? [] : strings(payload.targetLocations),
  };
  const hasLegacy = ["targetRoles", "targetIndustries", "targetLocations"]
    .some((key) => Object.prototype.hasOwnProperty.call(payload, key));
  if (hasLegacy && JSON.stringify(targetsToLegacy(targets)) !== JSON.stringify(supplied)) {
    throw new Error("Profile careerTargets 与 legacy targets 不一致");
  }
}

export function createProfileLocalPayloadMerger(
  database: DatabaseSync,
  ownerId: string,
): LocalPayloadMerger {
  const identities = new ProfileTargetIdentityStore(database, ownerId);
  const merger = ((entityType, current, server) =>
    mergeProfilePayload(entityType, current, server, identities.resolve.bind(identities))) as LocalPayloadMerger;
  merger.clear = () => identities.clear();
  return merger;
}

function mergeProfilePayload(
  entityType: string,
  currentPayload: Record<string, unknown> | undefined,
  serverPayload: Record<string, unknown>,
  resolveIdentity: IdentityResolver,
): Record<string, unknown> {
  assertProfileSyncPayload(entityType, serverPayload);
  if (entityType !== "user_profile" || !Array.isArray(serverPayload.careerTargets)) {
    return structuredClone(serverPayload);
  }
  const serverTargets = readTargets(serverPayload);
  const localTargets = currentPayload ? readTargets(currentPayload) : [];
  const localByFingerprint = new Map(
    localTargets
      .filter((target) => target.idKind === "opaque")
      .map((target) => [careerTargetFingerprint(target), target]),
  );
  return {
    ...structuredClone(serverPayload),
    careerTargets: serverTargets.map((target) => {
      const local = localByFingerprint.get(careerTargetFingerprint(target));
      return {
        ...target,
        id: resolveIdentity(careerTargetFingerprint(target), local?.id),
        idKind: "opaque" as const,
      };
    }),
  };
}

function readTargets(payload: Record<string, unknown>): CareerTargetV1[] {
  if (!Array.isArray(payload.careerTargets)) {
    return legacyToCareerTargets({
      targetRoles: payload.targetRoles ?? [],
      targetIndustries: payload.targetIndustries ?? [],
      targetLocations: payload.targetLocations ?? [],
    });
  }
  return payload.careerTargets.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Profile careerTargets[${index}] 无效`);
    }
    const target = value as Record<string, unknown>;
    const role = target.role === undefined ? null : target.role;
    if (role !== null && typeof role !== "string") throw new Error("Profile target role 无效");
    const identity = {
      role: role as string | null,
      industries: normalizedList(target.industries ?? [], "industries"),
      locations: normalizedList(target.locations ?? [], "locations"),
    };
    return normalizeCareerTarget({
      ...identity,
      id: typeof target.id === "string"
        ? target.id : `legacy:${careerTargetFingerprint(identity)}`,
      idKind: target.idKind ?? (typeof target.id === "string" ? "opaque" : "legacy_compatibility"),
      isPrimary: target.isPrimary,
    }, `Profile careerTargets[${index}]`);
  });
}

function normalizedList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Profile target ${field} 无效`);
  }
  return value.map((item) => item.normalize("NFKC").trim()).filter(Boolean);
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("Profile legacy target arrays 无效");
  }
  return [...value];
}
