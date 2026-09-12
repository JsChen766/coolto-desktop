import {
  MATERIAL_RELATION_PROPOSAL_SCHEMA,
  MATERIAL_RELATION_PROPOSAL_VERSION,
  MaterialContractError,
  type MaterialAssetV1,
  type MaterialIntakeAuthorizationV1,
  type MaterialReferenceV1,
  type MaterialValidationIssue,
  assertMaterialIntakeAuthorized,
  isDenseMaterialArray,
  isIsoTimestamp,
  isMaterialDataProperty,
  isMaterialRecord,
  isSafeOpaqueId,
} from "./material-types.js";
import { canonicalMaterialJson, normalizeMaterialHash, type MaterialCanonicalValue } from "./material-identity.js";
import { normalizeMaterialCitation, validateMaterialCitation, type MaterialCitationV1 } from "./material-citations.js";
import { assertMaterialAssetV1 } from "./material-normalizer.js";

export type MaterialRelationClassificationV1 = "unclassified" | "classified";
export interface MaterialExperienceReferenceProposalV1 { experienceId: string; citations: MaterialCitationV1[]; }
const MAX_EXPERIENCE_REFERENCES = 200;
const MAX_CITATIONS_PER_EXPERIENCE = 200;
export interface MaterialRelationPlanInputV1 {
  proposalId: string;
  preparedAt: string;
  classification: MaterialRelationClassificationV1;
  material: MaterialAssetV1;
  experienceReferences: Array<{ experienceId: string; citations: unknown[] }>;
}
export interface MaterialRelationProposalV1 {
  schema: typeof MATERIAL_RELATION_PROPOSAL_SCHEMA;
  version: typeof MATERIAL_RELATION_PROPOSAL_VERSION;
  proposalId: string;
  preparedAt: string;
  ownerId: string;
  materialId: string;
  materialHash: string;
  materialVersion: number;
  sourceKind: MaterialAssetV1["metadata"]["sourceKind"];
  classification: MaterialRelationClassificationV1;
  experienceReferences: MaterialExperienceReferenceProposalV1[];
}

export function planMaterialRelationProposal(input: MaterialRelationPlanInputV1, authorization?: MaterialIntakeAuthorizationV1): MaterialRelationProposalV1 {
  validatePlanInput(input);
  assertMaterialAssetV1(input.material, authorization);
  const sourceKind = input.material.metadata.sourceKind;
  if (input.classification === "unclassified" && input.experienceReferences.length > 0) throw new MaterialContractError("invalid_processing", "experienceReferences", "unclassified material cannot target Experience records");
  if (input.classification === "classified" && input.experienceReferences.length === 0) throw new MaterialContractError("invalid_processing", "experienceReferences", "classified material needs an Experience reference");
  const seenCitationKeys = new Set<string>();
  const references = input.experienceReferences.map((reference) => ({
    experienceId: reference.experienceId.trim(),
    citations: reference.citations.map((citation) => {
      const normalized = normalizeMaterialCitation(citation, input.material, authorization);
      const citationKey = canonicalMaterialJson(normalized as unknown as MaterialCanonicalValue);
      if (seenCitationKeys.has(citationKey)) throw new MaterialContractError("invalid_location", "experienceReferences", "citation must be unique across Experience targets");
      seenCitationKeys.add(citationKey);
      return normalized;
    }),
  }));
  references.sort((left, right) => compareStrings(left.experienceId, right.experienceId));
  return {
    schema: MATERIAL_RELATION_PROPOSAL_SCHEMA,
    version: MATERIAL_RELATION_PROPOSAL_VERSION,
    proposalId: input.proposalId.trim(),
    preparedAt: new Date(input.preparedAt).toISOString(),
    ownerId: input.material.identity.ownerId,
    materialId: input.material.identity.materialId,
    materialHash: normalizeMaterialHash(input.material.identity.contentHash),
    materialVersion: input.material.identity.contentVersion,
    sourceKind,
    classification: input.classification,
    experienceReferences: references.map((reference) => ({
      experienceId: reference.experienceId,
      citations: reference.citations.sort((left, right) => compareStrings(
        canonicalMaterialJson(left as unknown as MaterialCanonicalValue),
        canonicalMaterialJson(right as unknown as MaterialCanonicalValue))),
    })),
  };
}

function validatePlanInput(input: MaterialRelationPlanInputV1): void {
  const value = input as unknown;
  if (!isMaterialRecord(value)) throw new MaterialContractError("invalid_input", "$", "relation plan must be an object");
  const required: readonly string[] = ["proposalId", "preparedAt", "classification", "material", "experienceReferences"];
  assertStrictKeys(value, required, "$");
  if (!isMaterialRecord(input.material)) throw new MaterialContractError("invalid_input", "material", "material must be an object");
  if (!isSafeOpaqueId(input.proposalId)) throw new MaterialContractError("invalid_id", "proposalId", "proposal ID is not opaque-safe");
  if (!isIsoTimestamp(input.preparedAt)) throw new MaterialContractError("invalid_timestamp", "preparedAt", "preparedAt is invalid");
  if (input.classification !== "classified" && input.classification !== "unclassified") {
    throw new MaterialContractError("invalid_enum", "classification", "relation classification is invalid");
  }
  if (!isDenseMaterialArray(input.experienceReferences, MAX_EXPERIENCE_REFERENCES)) throw new MaterialContractError("invalid_processing", "experienceReferences", "Experience references are out of range");
  const seen = new Set<string>();
  for (let index = 0; index < input.experienceReferences.length; index += 1) {
    const path = `experienceReferences[${index}]`;
    const reference = input.experienceReferences[index];
    if (!isMaterialRecord(reference)) throw new MaterialContractError("invalid_input", path, "reference must be an object");
    const allowedReferenceKeys: readonly string[] = ["experienceId", "citations"];
    assertStrictKeys(reference, allowedReferenceKeys, path);
    if (!isSafeOpaqueId(reference.experienceId) || seen.has(reference.experienceId)) throw new MaterialContractError("invalid_id", `${path}.experienceId`, "Experience ID must be unique and opaque-safe");
    seen.add(reference.experienceId);
    if (!isDenseMaterialArray(reference.citations, MAX_CITATIONS_PER_EXPERIENCE) || reference.citations.length === 0) throw new MaterialContractError("invalid_location", `${path}.citations`, "each Experience needs bounded citations");
  }
}
export function validateMaterialRelationProposal(input: unknown, authorization?: MaterialIntakeAuthorizationV1): MaterialValidationIssue[] {
  if (!isMaterialRecord(input)) return [{ path: "$", code: "invalid_input", message: "relation proposal must be an object" }];
  const required: readonly string[] = ["schema", "version", "proposalId", "preparedAt", "ownerId", "materialId", "materialHash", "materialVersion", "sourceKind", "classification", "experienceReferences"];
  const issues: MaterialValidationIssue[] = [];
  if (!validateStrictKeys(input, required, "$", issues)) return issues;
  if (input.schema !== MATERIAL_RELATION_PROPOSAL_SCHEMA) issues.push({ path: "schema", code: "invalid_schema", message: "invalid relation schema" });
  if (input.version !== MATERIAL_RELATION_PROPOSAL_VERSION) issues.push({ path: "version", code: "invalid_version", message: "unsupported relation version" });
  if (!isSafeOpaqueId(input.proposalId) || !isSafeOpaqueId(input.ownerId) || !isSafeOpaqueId(input.materialId)) issues.push({ path: "identity", code: "invalid_id", message: "relation identity is invalid" });
  if (!isIsoTimestamp(input.preparedAt)) issues.push({ path: "preparedAt", code: "invalid_timestamp", message: "preparedAt is invalid" });
  let hash: string | null = null;
  try { hash = normalizeMaterialHash(input.materialHash); } catch { issues.push({ path: "materialHash", code: "invalid_hash", message: "material hash is invalid" }); }
  if (hash !== null && input.materialHash !== hash) issues.push({ path: "materialHash", code: "invalid_hash", message: "material hash must be normalized" });
  if (!Number.isSafeInteger(input.materialVersion) || (input.materialVersion as number) < 1) issues.push({ path: "materialVersion", code: "invalid_version_value", message: "material version is invalid" });
  if (input.sourceKind !== "user_upload" && input.sourceKind !== "user_text" && input.sourceKind !== "delivery_resume") issues.push({ path: "sourceKind", code: "invalid_enum", message: "relation source kind is invalid" });
  else {
    try { assertMaterialIntakeAuthorized(input.sourceKind, authorization); }
    catch (error) {
      const contract = error instanceof MaterialContractError ? error : null;
      issues.push({ path: "sourceKind", code: contract?.code ?? "not_material_authorized", message: "material intake is not authorized" });
    }
  }
  if (input.classification !== "classified" && input.classification !== "unclassified") issues.push({ path: "classification", code: "invalid_enum", message: "relation classification is invalid" });
  if (!isDenseMaterialArray(input.experienceReferences, MAX_EXPERIENCE_REFERENCES)) {
    issues.push({ path: "experienceReferences", code: "invalid_processing", message: "Experience references must be dense bounded entries" });
    return issues;
  }
  const references = input.experienceReferences as readonly unknown[];
  const reference: MaterialReferenceV1 = {
    materialId: typeof input.materialId === "string" ? input.materialId : "",
    ownerId: typeof input.ownerId === "string" ? input.ownerId : "",
    contentHash: hash ?? "0".repeat(64),
    contentVersion: typeof input.materialVersion === "number" ? input.materialVersion : 0,
    sourceKind: input.sourceKind === "user_upload" || input.sourceKind === "user_text" || input.sourceKind === "delivery_resume" ? input.sourceKind : "user_upload",
  };
  const seenExperienceIds = new Set<string>();
  const seenCitationKeys = new Set<string>();
  for (let index = 0; index < references.length; index += 1) {
    const value = references[index];
    const path = `experienceReferences[${index}]`;
    if (!isMaterialRecord(value)) { issues.push({ path, code: "invalid_input", message: "reference must be an object" }); continue; }
    const allowedReferenceKeys: readonly string[] = ["experienceId", "citations"];
    if (!validateStrictKeys(value, allowedReferenceKeys, path, issues)) continue;
    if (!isSafeOpaqueId(value.experienceId) || seenExperienceIds.has(value.experienceId)) issues.push({ path: `${path}.experienceId`, code: "invalid_id", message: "Experience ID is invalid" }); else seenExperienceIds.add(value.experienceId);
    if (!isDenseMaterialArray(value.citations, MAX_CITATIONS_PER_EXPERIENCE) || value.citations.length === 0) {
      issues.push({ path: `${path}.citations`, code: "invalid_location", message: "each Experience needs bounded citations" });
      continue;
    }
    for (let citationIndex = 0; citationIndex < value.citations.length; citationIndex += 1) {
      const citationValue = value.citations[citationIndex];
      const citationPath = `${path}.citations[${citationIndex}]`;
      const citationIssues = validateMaterialCitation(citationValue, reference, authorization);
      for (const current of citationIssues) issues.push({ ...current, path: `${citationPath}.${current.path}` });
      if (citationIssues.length === 0) {
        const citationKey = canonicalMaterialJson(normalizeMaterialCitation(citationValue, reference, authorization) as unknown as MaterialCanonicalValue);
        if (seenCitationKeys.has(citationKey)) issues.push({ path: citationPath, code: "invalid_location", message: "citation must be unique across Experience targets" });
        else seenCitationKeys.add(citationKey);
      }
    }
  }
  if (input.classification === "unclassified" && references.length > 0) issues.push({ path: "experienceReferences", code: "invalid_processing", message: "unclassified proposal cannot target Experience records" });
  if (input.classification === "classified" && references.length === 0) issues.push({ path: "experienceReferences", code: "invalid_processing", message: "classified proposal needs an Experience reference" });
  return issues;
}
function assertStrictKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  try {
    for (const key of expected) {
      if (!Object.hasOwn(value, key)) throw new MaterialContractError("invalid_input", `${path}.${key}`, "required field is missing");
      if (!isMaterialDataProperty(value, key)) throw new MaterialContractError("invalid_input", `${path}.${key}`, "field must be an enumerable data property");
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !expected.includes(key)) throw new MaterialContractError("unknown_field", `${path}.${typeof key === "string" ? key : "[symbol]"}`, "unknown field");
    }
  } catch (error) {
    if (error instanceof MaterialContractError) throw error;
    throw new MaterialContractError("invalid_input", path, "fields could not be inspected");
  }
}

function validateStrictKeys(value: Record<string, unknown>, expected: readonly string[], path: string, issues: MaterialValidationIssue[]): boolean {
  let valid = true;
  try {
    for (const key of expected) {
      if (!Object.hasOwn(value, key)) {
        issues.push({ path: `${path}.${key}`, code: "invalid_input", message: "required field is missing" });
        valid = false;
      } else if (!isMaterialDataProperty(value, key)) {
        issues.push({ path: `${path}.${key}`, code: "invalid_input", message: "field must be an enumerable data property" });
        valid = false;
      }
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !expected.includes(key)) {
        issues.push({ path: `${path}.${typeof key === "string" ? key : "[symbol]"}`, code: "unknown_field", message: "unknown field" });
        valid = false;
      }
    }
  } catch {
    issues.push({ path, code: "invalid_input", message: "fields could not be inspected" });
    return false;
  }
  return valid;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
