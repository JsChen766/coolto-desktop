import { sha256, stableStringify } from "../stable-snapshot.js";
import type { ResumeCompileResult } from "../compiler-types.js";
import { resumeGenerationReadiness } from "./generation-readiness.js";
import type { ResumeStructure } from "../types.js";
import type { ResumeWorkspace } from "./types.js";
import type { RevisionDeliveryManifest } from "../export/types.js";
export type { RevisionDeliveryManifest } from "../export/types.js";

export type RevisionDeliveryConsumer = "preview" | "save" | "pdf";

export interface RevisionDeliveryPayload {
  readonly manifest: RevisionDeliveryManifest;
  readonly candidateId: string | undefined;
  readonly candidateRevision: number | undefined;
  readonly structure: ResumeStructure;
  readonly observedCompileResult: ResumeCompileResult;
  readonly currentCompileResult: ResumeCompileResult;
}

/** Freezes one current, mechanically qualified workspace for delivery. */
export function createRevisionDeliveryManifest(
  workspace: ResumeWorkspace,
  consumer: RevisionDeliveryConsumer = "preview",
): RevisionDeliveryManifest {
  const readiness = resumeGenerationReadiness(workspace);
  if (!readiness.ready) {
    throw new Error(
      `Resume delivery requires current mechanical readiness: ${readiness.blockers
        .map((blocker) => blocker.code)
        .join(", ") || "measurement is not current"}`,
    );
  }
  const observedRevision = workspace.compileObservedRevision;
  if (observedRevision === undefined || observedRevision !== workspace.revision) {
    throw new Error("Resume delivery requires a current compile measurement for this revision");
  }
  return Object.freeze({
    consumer,
    candidateId: workspace.candidateId,
    revision: workspace.revision,
    observedRevision,
    sourceFingerprint: workspace.sourceSnapshot.sourceFingerprint,
    structureHash: sha256(stableStringify(workspace.structure)),
    compileHash: mechanicalCompileHash(workspace.compileResult),
  });
}

/** Rejects a preview/save/PDF payload whose workspace moved after freezing. */
export function assertRevisionDeliveryCurrent(
  manifest: RevisionDeliveryManifest,
  workspace: ResumeWorkspace,
): void {
  const current = createRevisionDeliveryManifest(workspace, manifest.consumer);
  if (sameRevisionDelivery(manifest, current)) return;
  throw new Error(
    "Resume delivery is stale: candidate, revision, source, structure, or compile measurement changed",
  );
}

/** Rejects a product PDF payload whose observed or fresh compile changed. */
export function assertRevisionDeliveryPayloadCurrent(
  input: RevisionDeliveryPayload,
): void {
  const structureHash = sha256(stableStringify(input.structure));
  const observedCompileHash = mechanicalCompileHash(input.observedCompileResult);
  const currentCompileHash = mechanicalCompileHash(input.currentCompileResult);
  if (
    input.candidateId !== input.manifest.candidateId ||
    input.candidateRevision !== input.manifest.revision ||
    structureHash !== input.manifest.structureHash ||
    observedCompileHash !== input.manifest.compileHash ||
    currentCompileHash !== input.manifest.compileHash
  ) {
    throw new Error(
      "Resume delivery is stale: candidate, revision, structure, or compile measurement changed",
    );
  }
}

/** Excludes observation timestamps and test-only fixture labels from identity. */
export function mechanicalCompileHash(result: ResumeCompileResult): string {
  const {
    fixtureId: _fixtureId,
    observedAt: _observedAt,
    ...mechanical
  } = result;
  return sha256(stableStringify(mechanical));
}

const DELIVERY_MANIFEST_KEYS: Record<string, true> = { consumer: true, candidateId: true, revision: true, observedRevision: true, sourceFingerprint: true, structureHash: true, compileHash: true };

export function parseRevisionDeliveryManifest(
  value: unknown,
): RevisionDeliveryManifest | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("简历交付版本参数无效");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !DELIVERY_MANIFEST_KEYS[key]) ||
    !isConsumer(record.consumer) ||
    !isNonEmptyString(record.candidateId) ||
    !isRevision(record.revision) ||
    !isRevision(record.observedRevision) ||
    !isNonEmptyString(record.sourceFingerprint) ||
    !isSha256(record.structureHash) ||
    !isSha256(record.compileHash)
  ) {
    throw new Error("简历交付版本参数无效");
  }
  return {
    consumer: record.consumer,
    candidateId: record.candidateId,
    revision: record.revision,
    observedRevision: record.observedRevision,
    sourceFingerprint: record.sourceFingerprint,
    structureHash: record.structureHash,
    compileHash: record.compileHash,
  };
}

function isConsumer(value: unknown): value is RevisionDeliveryManifest["consumer"] {
  return value === "preview" || value === "save" || value === "pdf";
}

function isRevision(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/iu.test(value);
}
/** Consumers may differ; the delivered candidate and measured revision may not. */
export function sameRevisionDelivery(
  left: RevisionDeliveryManifest,
  right: RevisionDeliveryManifest,
): boolean {
  return left.candidateId === right.candidateId &&
    left.revision === right.revision &&
    left.observedRevision === right.observedRevision &&
    left.sourceFingerprint === right.sourceFingerprint &&
    left.structureHash === right.structureHash &&
    left.compileHash === right.compileHash;
}
