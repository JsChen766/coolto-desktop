import { createHash } from "node:crypto";

import {
  type JdCreateInput,
  type JdRecord,
  type JdRequirement,
  type JdRequirementImportance,
  type JdRequirementV2Importance,
  type JdSearchOptions,
} from "../../../api/types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import {
  canonicalRequirementCategory,
  isV2RequirementCategory,
} from "./jd-category-mapping.js";

const V2_IMPORTANCE_VALUES: readonly JdRequirementV2Importance[] = [
  "must_have",
  "preferred",
  "optional",
];

interface AssignedRequirement {
  id: string;
  text: string;
  category: string;
  importance: JdRequirementV2Importance;
  keywords: string[];
  weight: number | null;
  sortOrder: number;
}

/** Resolve stable requirement IDs and canonical fields for backend push. */
export function assignRequirements(
  requirements: JdCreateInput["requirements"],
): AssignedRequirement[] {
  return (requirements ?? []).map((req, index) => ({
    id: createUuidV7(),
    text: req.text,
    category: canonicalRequirementCategory(req.v2Category, req.category),
    importance: canonicalImportance(req.v2Importance, req.importance),
    keywords: req.keywords,
    weight: null,
    sortOrder: index,
  }));
}

/**
 * Build the JD create push payload. Keys must match backend
 * `jd/syncadapter.writePayload` exactly (DisallowUnknownFields).
 */
export function toJdWritePayload(
  input: JdCreateInput,
  requirements: AssignedRequirement[],
): Record<string, unknown> {
  return {
    title: input.title,
    company: input.company ?? null,
    targetRole: input.targetRole ?? null,
    sourceKind: "pasted",
    sourceUrl: null,
    rawText: input.rawText,
    requirementsOrigin: "app_extracted",
    status: "active",
    requirements: requirements.map((req) => ({
      id: req.id,
      text: req.text,
      category: req.category,
      importance: req.importance,
      keywords: req.keywords,
      weight: req.weight,
    })),
  };
}

/**
 * Build the local projection payload mirroring backend `jd/syncadapter.payload`
 * so optimistic and server-confirmed reads share one mapper.
 */
export function buildLocalJd(
  id: string,
  input: JdCreateInput,
  requirements: AssignedRequirement[],
  now: string,
): Record<string, unknown> {
  return {
    id,
    title: input.title,
    company: input.company ?? null,
    targetRole: input.targetRole ?? null,
    sourceKind: "pasted",
    sourceUrl: null,
    rawText: input.rawText,
    jdHash: sha256(input.rawText),
    requirementsOrigin: "app_extracted",
    status: "active",
    requirements: requirements.map((req) => ({
      id: req.id,
      text: req.text,
      category: req.category,
      importance: req.importance,
      keywords: req.keywords,
      weight: req.weight,
      sortOrder: req.sortOrder,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

/** Map a local sync entity to the app-facing JdRecord. */
export function toJdRecord(entity: LocalEntity): JdRecord {
  const payload = entity.payload;
  return {
    id: str(payload.id),
    title: str(payload.title),
    company: nullableStr(payload.company),
    targetRole: nullableStr(payload.targetRole),
    rawText: str(payload.rawText),
    requirements: toRequirements(payload.requirements),
    jdHash: nullableStr(payload.jdHash),
    requirementMapId: null,
    requirementsOrigin: str(payload.requirementsOrigin) || "app_extracted",
    sourceThreadId: null,
    createdAt: str(payload.createdAt),
    updatedAt: str(payload.updatedAt),
    entityVersion: Math.max(1, entity.entityVersion),
    deletedAt: entity.operation === "delete" ? entity.changedAt : null,
    syncStatus: entity.syncStatus,
  };
}

/** Sort and paginate local JDs to match backend `List` (updated_at desc, id desc). */
export function filterJds(
  all: JdRecord[],
  options: JdSearchOptions,
): { items: JdRecord[]; nextCursor: string | null } {
  const sorted = [...all].sort(compareByUpdatedThenId);
  const start = decodeCursor(options.cursor, sorted);
  const limit = clampLimit(options.limit);
  const page = sorted.slice(start, start + limit);
  const end = start + limit;
  const nextCursor = end < sorted.length ? encodeCursor(page[page.length - 1]) : null;
  return { items: page, nextCursor };
}

function toRequirements(value: unknown): JdRequirement[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null))
    .filter((raw): raw is Record<string, unknown> => raw !== null)
    .sort((a, b) => num(a.sortOrder) - num(b.sortOrder))
    .map((raw) => {
      const canonical = str(raw.importance) as JdRequirementV2Importance;
      const category = str(raw.category);
      return {
        id: str(raw.id),
        text: str(raw.text),
        category,
        importance: canonicalToLegacy(canonical),
        keywords: strArray(raw.keywords),
        weight: typeof raw.weight === "number" ? raw.weight : null,
        v2Importance: V2_IMPORTANCE_VALUES.includes(canonical) ? canonical : null,
        v2Category: isV2RequirementCategory(category) ? category : null,
      };
    });
}

function canonicalImportance(
  v2: JdRequirementV2Importance | undefined,
  legacy: JdRequirementImportance,
): JdRequirementV2Importance {
  if (v2) return v2;
  if (legacy === "high") return "must_have";
  if (legacy === "medium") return "preferred";
  return "optional";
}

function canonicalToLegacy(
  importance: JdRequirementV2Importance,
): JdRequirementImportance {
  if (importance === "must_have") return "high";
  if (importance === "preferred") return "medium";
  return "low";
}

function compareByUpdatedThenId(a: JdRecord, b: JdRecord): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return 100;
  return Math.min(limit, 500);
}

function encodeCursor(jd: JdRecord | undefined): string | null {
  if (!jd) return null;
  return Buffer.from(`${jd.updatedAt}\u0000${jd.id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined, sorted: JdRecord[]): number {
  if (!cursor) return 0;
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const [updatedAt, id] = decoded.split("\u0000");
  const index = sorted.findIndex((jd) => jd.updatedAt === updatedAt && jd.id === id);
  return index < 0 ? sorted.length : index + 1;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
