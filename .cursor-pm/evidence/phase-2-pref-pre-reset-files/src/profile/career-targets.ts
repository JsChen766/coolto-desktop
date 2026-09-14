import { canonicalHash } from "./browser-canonical-hash.js";
import type { JsonValue } from "../agent-task/json-types.js";
import {
  assertSupportedProfileWrite,
  normalizeProfileCareerStage,
  normalizeProfileLanguage,
  normalizeProfileResumeStyle,
} from "./profile-defaults.js";
import {
  clean,
  cleanNullable,
  has,
  hasAnyTargetField,
  hasTargetField,
  legacyProjection,
  normalizeId,
  normalizedList,
  objectValue,
  optionalText,
  optionalYears,
  stageValues,
  union,
} from "./profile-normalization.js";
const OPAQUE_TARGET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type CareerTargetIdKindV1 = "opaque" | "legacy_compatibility";

export interface CareerTargetV1 {
  id: string;
  idKind: CareerTargetIdKindV1;
  role: string | null;
  industries: string[];
  locations: string[];
  isPrimary: boolean;
}

export interface CareerTargetInputV1 {
  id?: unknown;
  idKind?: unknown;
  role?: unknown;
  industries?: unknown;
  locations?: unknown;
  isPrimary?: unknown;
}

export type CareerTargetIdFactory = () => string;

export interface CareerProfileV1 {
  currentTitle: string | null;
  currentCompany: string | null;
  yearsOfExperience: number | null;
  careerStage: string | null;
  careerTargets: CareerTargetV1[];
  targetRoles: string[];
  targetIndustries: string[];
  targetLocations: string[];
  preferredLanguage: string;
  resumeStyle: string;
}

export interface CareerProfileChangeSetV1 {
  currentTitle?: string | null;
  currentCompany?: string | null;
  yearsOfExperience?: number | null;
  careerStage?: string | null;
  careerTargets?: CareerTargetV1[];
  preferredLanguage?: string;
  resumeStyle?: string;
}

export function normalizeCareerTarget(
  input: unknown,
  path = "careerTarget",
): CareerTargetV1 {
  const record = objectValue(input, path);
  const idKind = normalizeIdKind(record.idKind, path);
  const role = optionalText(record.role, `${path}.role`);
  const industries = normalizedList(record.industries ?? [], `${path}.industries`);
  const locations = normalizedList(record.locations ?? [], `${path}.locations`);
  if (!role && industries.length === 0 && locations.length === 0) {
    throw new Error(`${path} 至少需要岗位、行业或城市之一`);
  }
  const isPrimary = record.isPrimary === undefined ? false : record.isPrimary;
  if (typeof isPrimary !== "boolean") throw new Error(`${path}.isPrimary 必须是 boolean`);
  if (record.id === undefined) throw new Error(`${path}.id 必须由创建方提供`);
  const id = normalizeId(record.id, path);
  const identity = { role, industries, locations };
  if (idKind === "legacy_compatibility" && id !== legacyTargetId(identity)) {
    throw new Error(`${path} legacy compatibility ID 与目标内容不匹配`);
  }
  if (idKind === "opaque") {
    if (id.startsWith("legacy:")) throw new Error(`${path} legacy compatibility ID 必须显式标记`);
    if (!OPAQUE_TARGET_ID_PATTERN.test(id)) throw new Error(`${path}.id 必须来自 opaque target idFactory`);
  }
  return { id, idKind, role, industries, locations, isPrimary };
}
export function createCareerTarget(
  input: Omit<CareerTargetInputV1, "id" | "idKind">,
  idFactory: CareerTargetIdFactory,
): CareerTargetV1 {
  const id = idFactory();
  return normalizeCareerTarget({ ...input, id, idKind: "opaque" });
}

export function normalizeCareerTargets(input: unknown): CareerTargetV1[] {
  if (!Array.isArray(input)) throw new Error("careerTargets 必须是数组");
  if (input.length > 20) throw new Error("careerTargets 最多只能有 20 个目标");
  const targets = input.map((value, index) => normalizeCareerTarget(value, `careerTargets[${index}]`));
  const ids = new Set<string>();
  const identities = new Set<string>();
  let primaryCount = 0;
  for (const target of targets) {
    if (ids.has(target.id)) throw new Error("careerTargets 不能有重复 ID");
    ids.add(target.id);
    const identity = canonicalTargetIdentity(target);
    if (identities.has(identity)) throw new Error("careerTargets 不能有重复目标");
    identities.add(identity);
    if (target.isPrimary) primaryCount += 1;
  }
  if (primaryCount > 1) throw new Error("careerTargets 最多只能有一个主要目标");
  return targets;
}
export function setPrimaryCareerTarget(
  targets: readonly CareerTargetV1[],
  targetId: string,
): CareerTargetV1[] {
  const normalized = normalizeCareerTargets(targets);
  if (!normalized.some((target) => target.id === targetId)) throw new Error("目标 ID 不存在");
  return normalized.map((target) => ({ ...target, isPrimary: target.id === targetId }));
}

export function careerTargetFingerprint(
  target: Pick<CareerTargetV1, "role" | "industries" | "locations">,
): string {
  return canonicalHash(canonicalTargetValue(target));
}

export function legacyToCareerTargets(input: {
  targetRoles?: unknown;
  targetIndustries?: unknown;
  targetLocations?: unknown;
}): CareerTargetV1[] {
  const roles = normalizedList(input.targetRoles === undefined ? [] : input.targetRoles, "targetRoles");
  const industries = normalizedList(input.targetIndustries === undefined ? [] : input.targetIndustries, "targetIndustries");
  const locations = normalizedList(input.targetLocations === undefined ? [] : input.targetLocations, "targetLocations");
  if (roles.length === 0 && industries.length === 0 && locations.length === 0) return [];
  const identity = { role: roles[0] ?? null, industries, locations };
  return [normalizeCareerTarget({
    ...identity,
    id: legacyTargetId(identity),
    idKind: "legacy_compatibility",
  })];
}

export function targetsToLegacy(targets: readonly CareerTargetV1[]): {
  targetRoles: string[];
  targetIndustries: string[];
  targetLocations: string[];
} {
  const normalized = normalizeCareerTargets(targets);
  return {
    targetRoles: union(normalized.map((target) => target.role ? [target.role] : [])),
    targetIndustries: [...new Set(normalized.flatMap((target) => target.industries))].sort(),
    targetLocations: [...new Set(normalized.flatMap((target) => target.locations))].sort(),
  };
}

export function normalizeCareerProfile(input: unknown): CareerProfileV1 {
  const record = objectValue(input, "profile");
  const careerTargets = readTargets(record);
  const legacy = targetsToLegacy(careerTargets);
  return {
    currentTitle: optionalText(record.currentTitle, "currentTitle"),
    currentCompany: optionalText(record.currentCompany, "currentCompany"),
    yearsOfExperience: optionalYears(record.yearsOfExperience),
    careerStage: normalizeProfileCareerStage(record.careerStage),
    careerTargets,
    ...legacy,
    preferredLanguage: normalizeProfileLanguage(record.preferredLanguage),
    resumeStyle: normalizeProfileResumeStyle(record.resumeStyle),
  };
}

export function normalizeCareerProfileChangeSet(input: unknown): CareerProfileChangeSetV1 {
  const record = objectValue(input, "profile change");
  const result: CareerProfileChangeSetV1 = {};
  if (has(record, "currentTitle")) result.currentTitle = optionalText(record.currentTitle, "currentTitle");
  if (has(record, "currentCompany")) result.currentCompany = optionalText(record.currentCompany, "currentCompany");
  if (has(record, "yearsOfExperience")) result.yearsOfExperience = optionalYears(record.yearsOfExperience);
  if (has(record, "careerStage")) {
    const stage = normalizeProfileCareerStage(record.careerStage);
    if (stage !== null && !stageValues(stage)) throw new Error("careerStage 使用了不支持的新值");
    result.careerStage = stage;
  }
  if (hasAnyTargetField(record)) result.careerTargets = readTargets(record);
  if (has(record, "preferredLanguage")) result.preferredLanguage = String(assertSupportedProfileWrite(record.preferredLanguage, "language"));
  if (has(record, "resumeStyle")) result.resumeStyle = String(assertSupportedProfileWrite(record.resumeStyle, "resumeStyle"));
  if (Object.keys(result).length === 0) throw new Error("Profile change 不能为空");
  return result;
}

function readTargets(record: Record<string, unknown>): CareerTargetV1[] {
  const hasCanonical = has(record, "careerTargets");
  const hasLegacy = hasTargetField(record);
  const targets = hasCanonical
    ? normalizeCareerTargets(record.careerTargets)
    : legacyToCareerTargets(record);
  if (hasCanonical && hasLegacy) {
    const canonicalLegacy = targetsToLegacy(targets);
    const supplied = legacyProjection(record);
    if (JSON.stringify(canonicalLegacy) !== JSON.stringify(supplied)) {
      throw new Error("careerTargets 与 legacy target arrays 不一致");
    }
  }
  return targets;
}


function canonicalTargetIdentity(target: CareerTargetV1): string {
  return careerTargetFingerprint(target);
}

function canonicalTargetValue(target: Pick<CareerTargetV1, "role" | "industries" | "locations">): JsonValue {
  return {
    role: cleanNullable(target.role),
    industries: [...target.industries].map(clean).sort(),
    locations: [...target.locations].map(clean).sort(),
  };
}
function normalizeIdKind(value: unknown, path: string): CareerTargetIdKindV1 {
  if (value === undefined) return "opaque";
  if (value !== "opaque" && value !== "legacy_compatibility") {
    throw new Error(`${path}.idKind 必须是 opaque 或 legacy_compatibility`);
  }
  return value;
}

function legacyTargetId(
  target: Pick<CareerTargetV1, "role" | "industries" | "locations">,
): string {
  return `legacy:${careerTargetFingerprint(target)}`;
}
