import { createHash } from "node:crypto";

import type {
  ExperienceCreateInput,
  ExperienceDetail,
  ExperienceRevision,
} from "../../../api/types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";

const FACT_BANK_NOT_APPLICABLE = "not_applicable";

/**
 * Build the create push payload sent to the backend sync command handler.
 * The backend decodes with DisallowUnknownFields, so the key set must match
 * `experience/syncadapter.createPayload` exactly.
 */
export function toExperienceWritePayload(
  input: ExperienceCreateInput,
  revisionId: string,
): Record<string, unknown> {
  return {
    revisionId,
    category: input.category,
    title: input.title,
    content: input.content,
    organization: input.organization ?? null,
    role: input.role ?? null,
    location: input.location ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    tags: input.tags ?? [],
    status: input.status ?? "active",
    source: "manual",
  };
}

/**
 * Build the local projection payload stored in `sync_entities`. It mirrors the
 * backend `experience/syncadapter.payload` shape so optimistic local reads and
 * server-confirmed reads flow through the same mapper.
 */
export function buildLocalExperience(
  id: string,
  revisionId: string,
  input: ExperienceCreateInput,
  now: string,
): Record<string, unknown> {
  return {
    id,
    category: input.category,
    title: input.title,
    organization: input.organization ?? null,
    role: input.role ?? null,
    location: input.location ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    tags: input.tags ?? [],
    status: input.status ?? "active",
    currentRevisionId: revisionId,
    currentRevision: {
      id: revisionId,
      experienceId: id,
      content: input.content,
      source: "manual",
      revisionHash: sha256(input.content),
      revisionNumber: 1,
      createdAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/** Map a local sync entity (local or server projection payload) to a detail. */
export function toExperienceDetail(entity: LocalEntity): ExperienceDetail {
  const payload = entity.payload;
  const currentRevision = toRevision(payload.currentRevision);
  return {
    id: str(payload.id),
    category: str(payload.category) as ExperienceDetail["category"],
    title: str(payload.title),
    organization: nullableStr(payload.organization),
    role: nullableStr(payload.role),
    location: nullableStr(payload.location),
    startDate: nullableStr(payload.startDate),
    endDate: nullableStr(payload.endDate),
    tags: strArray(payload.tags),
    status: (payload.status === "archived" ? "archived" : "active"),
    currentRevisionId: nullableStr(payload.currentRevisionId),
    ...(currentRevision ? { currentRevision } : {}),
    createdAt: str(payload.createdAt),
    updatedAt: str(payload.updatedAt),
    entityVersion: Math.max(1, entity.entityVersion),
    deletedAt: entity.operation === "delete" ? entity.changedAt : null,
    syncStatus: entity.syncStatus,
    revisions: currentRevision ? [currentRevision] : [],
  };
}

function toRevision(value: unknown): ExperienceRevision | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return {
    id: str(record.id),
    experienceId: str(record.experienceId),
    content: str(record.content),
    source: str(record.source),
    revisionHash: nullableStr(record.revisionHash),
    factBankStatus: FACT_BANK_NOT_APPLICABLE,
    createdAt: str(record.createdAt),
  };
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
