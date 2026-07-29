import {
  type ApplicationCreateInput,
  type ApplicationListOptions,
  type ApplicationRecord,
  type ApplicationStatus,
  type ApplicationTransitionInput,
  type ApplicationUpdateInput,
} from "../../../tracker/types.js";

export interface ApplicationSnapshots {
  jdTitle: string | null;
  resumeTitle: string | null;
  resumeContentHash: string | null;
}

export function toApplicationCreatePayload(
  input: ApplicationCreateInput,
  snapshots: ApplicationSnapshots,
): Record<string, unknown> {
  return {
    jdId: input.jdId ?? null,
    resumeId: input.resumeId ?? null,
    companyName: input.companyName.trim(),
    roleName: input.roleName.trim(),
    jdTitleSnapshot: snapshots.jdTitle,
    resumeTitleSnapshot: snapshots.resumeTitle,
    resumeContentHashSnapshot: snapshots.resumeContentHash,
    deliveryMethod: input.deliveryMethod,
    targetUrl: input.targetUrl ?? null,
    appliedAt: input.appliedAt ?? null,
    pendingConfirmation: input.pendingConfirmation ?? false,
    source: input.source ?? "manual",
    dedupeKey: input.dedupeKey ?? null,
    companyBusiness: input.companyBusiness ?? null,
    roleSummary: input.roleSummary ?? null,
    companyCulture: input.companyCulture ?? null,
  };
}

export function toApplicationUpdatePayload(
  input: ApplicationUpdateInput,
): Record<string, unknown> {
  return {
    jdId: input.jdId,
    resumeId: input.resumeId,
    resumeContentHashSnapshot: input.resumeContentHashSnapshot,
    companyName: input.companyName.trim(),
    roleName: input.roleName.trim(),
    deliveryMethod: input.deliveryMethod,
    targetUrl: input.targetUrl,
    appliedAt: input.appliedAt,
    pendingConfirmation: input.pendingConfirmation,
    companyBusiness: input.companyBusiness,
    roleSummary: input.roleSummary,
    companyCulture: input.companyCulture,
    rejectionReason: input.rejectionReason,
  };
}

export function toApplicationTransitionPayload(
  input: ApplicationTransitionInput,
): Record<string, unknown> {
  return {
    toStatus: input.toStatus,
    occurredAt: input.occurredAt ?? null,
    reason: input.reason ?? null,
  };
}

export function buildLocalApplication(
  id: string,
  input: ApplicationCreateInput,
  snapshots: ApplicationSnapshots,
  now: string,
): Record<string, unknown> {
  return {
    id,
    ...toApplicationCreatePayload(input, snapshots),
    status: "applied",
    rejectionReason: null,
    entityVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildUpdatedApplication(
  current: ApplicationRecord,
  input: ApplicationUpdateInput,
  snapshots: ApplicationSnapshots,
  now: string,
): Record<string, unknown> {
  return {
    ...toProjectionPayload(current),
    ...toApplicationUpdatePayload(input),
    jdTitleSnapshot: snapshots.jdTitle,
    resumeTitleSnapshot: snapshots.resumeTitle,
    resumeContentHashSnapshot: snapshots.resumeContentHash,
    updatedAt: now,
  };
}

export function buildTransitionedApplication(
  current: ApplicationRecord,
  toStatus: ApplicationStatus,
  now: string,
): Record<string, unknown> {
  return { ...toProjectionPayload(current), status: toStatus, updatedAt: now };
}

export function filterApplications(
  applications: ApplicationRecord[],
  options: ApplicationListOptions,
): { items: ApplicationRecord[]; nextCursor: string | null } {
  const query = options.query?.trim().toLocaleLowerCase();
  const filtered = applications.filter((item) => {
    if (options.status && item.status !== options.status) return false;
    if (options.jdId && item.jdId !== options.jdId) return false;
    if (options.resumeId && item.resumeId !== options.resumeId) return false;
    return !query || [item.companyName, item.roleName].some(
      (value) => value.toLocaleLowerCase().includes(query),
    );
  });
  const sorted = [...filtered].sort(compareApplication);
  const start = cursorStart(options.cursor, sorted);
  const limit = clampLimit(options.limit);
  const items = sorted.slice(start, start + limit);
  const next = start + limit < sorted.length ? items.at(-1) : undefined;
  return { items, nextCursor: next ? encodeCursor(next) : null };
}

function toProjectionPayload(value: ApplicationRecord): Record<string, unknown> {
  const { deletedAt: _deletedAt, syncStatus: _syncStatus, ...payload } = value;
  return payload;
}

function compareApplication(a: ApplicationRecord, b: ApplicationRecord): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function clampLimit(limit: number | undefined): number {
  return limit && Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100;
}

function encodeCursor(item: ApplicationRecord): string {
  return Buffer.from(`${item.updatedAt}\0${item.id}`, "utf8").toString("base64url");
}

function cursorStart(cursor: string | undefined, items: ApplicationRecord[]): number {
  if (!cursor) return 0;
  const [updatedAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("\0");
  const index = items.findIndex((item) => item.updatedAt === updatedAt && item.id === id);
  return index < 0 ? items.length : index + 1;
}
