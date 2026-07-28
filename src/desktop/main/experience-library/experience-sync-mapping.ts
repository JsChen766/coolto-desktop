import { createHash } from "node:crypto";

import type {
  ExperienceCreateInput,
  ExperienceDetail,
  ExperienceRevision,
  ExperienceSearchOptions,
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
): Record<string, unknown> {
  return {
    category: input.category,
    title: input.title,
    content: input.content,
    organization: input.organization ?? null,
    role: input.role ?? null,
    location: input.location ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    tags: input.tags ?? [],
    status: "active",
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
    status: "active",
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

/** Filter, sort and paginate local experiences to match backend `List`. */
export function filterExperiences(
  all: ExperienceDetail[],
  options: ExperienceSearchOptions,
): { items: ExperienceDetail[]; nextCursor: string | null } {
  const query = options.q?.trim().toLocaleLowerCase();
  const filtered = all.filter((exp) => {
    if (options.category && exp.category !== options.category) return false;
    if (query && !matchesQuery(exp, query)) return false;
    if (options.tags && options.tags.length > 0 && !overlaps(exp.tags, options.tags)) {
      return false;
    }
    return true;
  });
  const sorted = filtered.sort(compareByUpdatedThenId);
  const start = decodeCursor(options.cursor, sorted);
  const limit = clampLimit(options.limit);
  const page = sorted.slice(start, start + limit);
  const end = start + limit;
  const nextCursor = end < sorted.length ? encodeCursor(page[page.length - 1]) : null;
  return { items: page, nextCursor };
}

function matchesQuery(exp: ExperienceDetail, query: string): boolean {
  return [exp.title, exp.organization, exp.role].some(
    (value) => value != null && value.toLocaleLowerCase().includes(query),
  );
}

function overlaps(tags: string[], wanted: string[]): boolean {
  const set = new Set(tags);
  return wanted.some((tag) => set.has(tag));
}

function compareByUpdatedThenId(a: ExperienceDetail, b: ExperienceDetail): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return 100;
  return Math.min(limit, 500);
}

function encodeCursor(exp: ExperienceDetail | undefined): string | null {
  if (!exp) return null;
  return Buffer.from(`${exp.updatedAt}\u0000${exp.id}`, "utf8").toString("base64url");
}

function decodeCursor(
  cursor: string | undefined,
  sorted: ExperienceDetail[],
): number {
  if (!cursor) return 0;
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const [updatedAt, id] = decoded.split("\u0000");
  const index = sorted.findIndex(
    (exp) => exp.updatedAt === updatedAt && exp.id === id,
  );
  return index < 0 ? sorted.length : index + 1;
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
