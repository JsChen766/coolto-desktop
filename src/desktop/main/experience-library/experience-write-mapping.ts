import { createHash } from "node:crypto";

import type {
  ExperienceDetail,
  ExperienceUpdateInput,
} from "../../../api/types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";

export interface ExperienceMutation {
  writePayload: Record<string, unknown>;
  localPayload: Record<string, unknown>;
}

export function buildExperienceUpdate(
  entity: LocalEntity,
  current: ExperienceDetail,
  changes: ExperienceUpdateInput,
  revisionId: string,
  now: string,
): ExperienceMutation {
  const content = changes.content ?? current.currentRevision?.content ?? "";
  const next = {
    category: changes.category ?? current.category,
    title: changes.title ?? current.title,
    content,
    organization: field(changes, "organization", current.organization),
    role: field(changes, "role", current.role),
    location: field(changes, "location", current.location),
    startDate: field(changes, "startDate", current.startDate),
    endDate: field(changes, "endDate", current.endDate),
    tags: changes.tags ?? current.tags,
    status: changes.status ?? current.status,
  };
  const writePayload = {
    revisionId,
    ...next,
    source: "manual",
  };
  const localPayload: Record<string, unknown> = {
    ...entity.payload,
    category: next.category,
    title: next.title,
    organization: next.organization,
    role: next.role,
    location: next.location,
    startDate: next.startDate,
    endDate: next.endDate,
    tags: [...next.tags],
    status: next.status,
    updatedAt: now,
  };
  const currentHash = current.currentRevision?.revisionHash
    ?? hash(current.currentRevision?.content ?? "");
  const nextHash = hash(content);
  if (currentHash !== nextHash) {
    const number = revisionNumber(entity.payload.currentRevision) + 1;
    localPayload.currentRevisionId = revisionId;
    localPayload.currentRevision = {
      id: revisionId,
      experienceId: current.id,
      content,
      source: "manual",
      revisionHash: nextHash,
      revisionNumber: number,
      createdAt: now,
    };
  }
  return { writePayload, localPayload };
}

export function buildExperienceDelete(
  entity: LocalEntity,
  now: string,
): ExperienceMutation {
  return {
    writePayload: {},
    localPayload: { ...entity.payload, updatedAt: now },
  };
}

function field<K extends keyof ExperienceUpdateInput>(
  changes: ExperienceUpdateInput,
  key: K,
  fallback: string | null,
): string | null {
  return Object.prototype.hasOwnProperty.call(changes, key)
    ? (changes[key] as string | null)
    : fallback;
}

function revisionNumber(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const number = (value as Record<string, unknown>).revisionNumber;
  return typeof number === "number" && Number.isSafeInteger(number) ? number : 0;
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
