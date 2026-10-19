import { createHash, randomUUID } from "node:crypto";

import { BUNDLED_PRIVACY_POLICY } from "../../../privacy/policy.js";
import { canonicalExportJson } from "../../../privacy/export-canonical.js";
import type {
  CloudExportRelationship,
  CloudExportSnapshotEntry,
  CloudExportSnapshotV1,
} from "../../../privacy/types.js";
import type { SyncEntityType } from "../../../sync/types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";

/** Minimal sync surface needed to project UI-visible business assets. */
export interface LocalBusinessExportSource {
  listEntities(entityType: SyncEntityType): LocalEntity[];
}

const BUSINESS_KINDS = [
  { entityType: "experience" as const, kind: "experience", folder: "experiences" },
  { entityType: "job_description" as const, kind: "jd", folder: "jds" },
  { entityType: "resume" as const, kind: "resume", folder: "resumes" },
  { entityType: "application" as const, kind: "application", folder: "applications" },
];

const STRIP_KEYS = new Set([
  "ownerid", "owner_id", "userid", "user_id",
  "accesstoken", "access_token", "password", "api_key", "apikey",
  "passphrase", "absolute_path", "absolutepath", "private_key", "privatekey",
]);

/**
 * Build a CloudExportSnapshotV1-shaped package from the local sync store so OSS
 * 「导出本机数据」includes experiences / JDs / resumes / applications even when
 * includeCloudAssets is false (no Coolto cloud).
 */
export function buildLocalBusinessSnapshot(input: {
  source: LocalBusinessExportSource;
  accountScopeDigest: string;
  policyVersion?: string;
  capturedAt?: string;
  snapshotId?: string;
}): CloudExportSnapshotV1 {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const entries: CloudExportSnapshotEntry[] = [];
  const counts: Record<string, number> = {};
  const byKind = new Map<string, LocalEntity[]>();

  for (const spec of BUSINESS_KINDS) {
    const live = input.source.listEntities(spec.entityType)
      .filter((entity) => entity.operation !== "delete");
    byKind.set(spec.kind, live);
    counts[spec.kind] = live.length;
    for (const entity of live) {
      const value = sanitizeExportValue(entity.payload);
      const body = canonicalExportJson(value);
      entries.push({
        path: `local-business/${spec.folder}/${entity.entityId}.json`,
        kind: spec.kind,
        bytes: Buffer.byteLength(body, "utf8"),
        sha256: createHash("sha256").update(body, "utf8").digest("hex"),
        protected: true,
        value,
      });
    }
  }

  const relationships = buildRelationships(byKind);
  const relationshipBody = canonicalExportJson(relationships);
  const relationshipSha256 = createHash("sha256")
    .update(relationshipBody, "utf8").digest("hex");
  const rootMaterial = canonicalExportJson({ entries, relationships, counts });
  return {
    schemaVersion: 1,
    snapshotId: input.snapshotId ?? randomUUID(),
    capturedAt,
    policyVersion: input.policyVersion ?? BUNDLED_PRIVACY_POLICY.policyVersion,
    accountScopeDigest: input.accountScopeDigest,
    entries,
    relationships,
    counts,
    relationshipCount: relationships.length,
    relationshipSha256,
    rootSha256: createHash("sha256").update(rootMaterial, "utf8").digest("hex"),
  };
}

function buildRelationships(
  byKind: Map<string, LocalEntity[]>,
): CloudExportRelationship[] {
  const relationships: CloudExportRelationship[] = [];
  for (const entity of byKind.get("application") ?? []) {
    const jdId = stringField(entity.payload, "jdId");
    const resumeId = stringField(entity.payload, "resumeId");
    if (jdId) {
      relationships.push({
        from: `jd:${jdId}`, relation: "applied_with", to: `application:${entity.entityId}`,
      });
    }
    if (resumeId) {
      relationships.push({
        from: `resume:${resumeId}`, relation: "attached_to", to: `application:${entity.entityId}`,
      });
    }
  }
  for (const entity of byKind.get("resume") ?? []) {
    const experienceIds = entity.payload.experienceIds;
    if (!Array.isArray(experienceIds)) continue;
    for (const experienceId of experienceIds) {
      if (typeof experienceId !== "string" || !experienceId.trim()) continue;
      relationships.push({
        from: `experience:${experienceId}`,
        relation: "used_by",
        to: `resume:${entity.entityId}`,
      });
    }
  }
  return relationships;
}

function stringField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function sanitizeExportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeExportValue);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (STRIP_KEYS.has(key.toLowerCase())) continue;
    out[key] = sanitizeExportValue(item);
  }
  return out;
}
