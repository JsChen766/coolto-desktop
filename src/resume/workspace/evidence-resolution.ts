import { EvidenceValidationError } from "../evidence-validation.js";
import type { ResumeSourceSnapshot } from "../source-types.js";
import type { BulletEvidenceBinding } from "../source-types.js";
import type { ResumeStructure } from "../types.js";
import { ResumeWorkspaceError } from "./errors.js";
import { candidateMap } from "./evidence-binding-resolver.js";
import { resolveBindingWithAutoRepair } from "./evidence-auto-repair.js";
import type { EvidenceRepairAction } from "./evidence-auto-repair.js";
import {
  nextBulletIdFactory,
  resolveSingleOperation,
} from "./evidence-single-operation.js";
import type {
  EvidenceBindingInput,
  ResumePatchOperation,
  ResumePatchOperationInput,
} from "./types.js";

/**
 * Resolves model-facing evidence references against the immutable snapshot.
 * Every cited `evidenceId` must be a candidate generated from the snapshot
 * content; all cited candidates must belong to one experience; requirement
 * coverage is derived deterministically from the cited candidates instead of
 * model-provided IDs. The caller assigns the stable bullet ID.
 */
export function resolveEvidenceBindingInput(
  snapshot: ResumeSourceSnapshot,
  input: EvidenceBindingInput,
  bulletId: string,
): BulletEvidenceBinding {
  return resolveBindingWithAutoRepair(snapshot, input, bulletId, new Map()).binding;
}

export function resolveEvidenceBindingInputs(
  snapshot: ResumeSourceSnapshot,
  inputs: readonly EvidenceBindingInput[],
  bulletIdFor: (index: number) => string,
): BulletEvidenceBinding[] {
  return inputs.map((input, index) =>
    resolveBindingWithAutoRepair(
      snapshot,
      input,
      bulletIdFor(index),
      new Map(),
    ).binding,
  );
}

/**
 * Best-effort resolution of an initial draft: valid bindings land (with
 * automatic evidence repair), invalid ones return a rejection list with exact
 * messages. The workspace is created regardless, so one bad bullet never
 * blocks the first draft.
 */
export function resolveInitialBindingsBestEffort(
  snapshot: ResumeSourceSnapshot,
  inputs: readonly EvidenceBindingInput[],
): {
  bindings: BulletEvidenceBinding[];
  rejected: Array<{ index: number; message: string }>;
  repairs: EvidenceRepairAction[];
} {
  const bindings: BulletEvidenceBinding[] = [];
  const rejected: Array<{ index: number; message: string }> = [];
  const repairs: EvidenceRepairAction[] = [];
  const work = new Map<string, BulletEvidenceBinding>();
  inputs.forEach((input, index) => {
    try {
      const repaired = resolveBindingWithAutoRepair(
        snapshot,
        input,
        `bl-${index}`,
        work,
      );
      work.set(repaired.binding.bulletId, repaired.binding);
      bindings.push(repaired.binding);
      repairs.push(...repaired.repairs);
    } catch (error) {
      if (error instanceof EvidenceValidationError) {
        rejected.push({ index, message: error.message });
        return;
      }
      throw error;
    }
  });
  return { bindings, rejected, repairs };
}

/**
 * Strict resolution of a full patch batch: any failure aborts the whole batch.
 * Used by the quality repairer, where each alternative is tried independently.
 */
export function resolveOperations(
  snapshot: ResumeSourceSnapshot,
  structure: ResumeStructure,
  bindings: readonly BulletEvidenceBinding[],
  operations: readonly ResumePatchOperationInput[],
): ResumePatchOperation[] {
  return resolveOperationsBestEffort(snapshot, structure, bindings, operations)
    .resolved;
}

export interface BestEffortResolution {
  resolved: ResumePatchOperation[];
  rejected: Array<{ index: number; message: string }>;
  repairs: EvidenceRepairAction[];
}

/**
 * Best-effort resolution of a patch batch: each operation is resolved
 * independently against the evolving work map. Valid operations land (with
 * automatic evidence repair), invalid ones return per-operation errors instead
 * of rolling back the whole batch.
 */
export function resolveOperationsBestEffort(
  snapshot: ResumeSourceSnapshot,
  structure: ResumeStructure,
  bindings: readonly BulletEvidenceBinding[],
  operations: readonly ResumePatchOperationInput[],
): BestEffortResolution {
  const candidates = candidateMap(snapshot);
  const work = new Map(bindings.map((binding) => [binding.bulletId, binding]));
  const nextId = nextBulletIdFactory(structure);
  const resolved: ResumePatchOperation[] = [];
  const rejected: Array<{ index: number; message: string }> = [];
  const repairs: EvidenceRepairAction[] = [];
  operations.forEach((operation, index) => {
    try {
      const outcome = resolveSingleOperation(
        snapshot,
        work,
        structure,
        operation,
        candidates,
        nextId,
      );
      resolved.push(outcome.operation);
      repairs.push(...outcome.repairs);
    } catch (error) {
      if (
        error instanceof EvidenceValidationError ||
        error instanceof ResumeWorkspaceError
      ) {
        rejected.push({ index, message: error.message });
        return;
      }
      throw error;
    }
  });
  return { resolved, rejected, repairs };
}
