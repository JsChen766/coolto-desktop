import { EvidenceValidationError } from "../evidence-validation.js";
import type { ResumeSourceSnapshot } from "../source-types.js";
import type { BulletEvidenceBinding } from "../source-types.js";
import { ResumeWorkspaceError } from "./errors.js";
import {
  assertNoRangeConflicts,
  assertSupportedNumbers,
  candidateMap,
  resolveExcerpts,
} from "./evidence-binding-resolver.js";
import { applyIncrementalText } from "./incremental-text-edit.js";
import type { ResumeStructure } from "../types.js";
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
  const candidates = candidateMap(snapshot);
  const resolved = resolveExcerpts(input, candidates);
  assertSupportedNumbers(input.bulletText, resolved.excerpts, candidates);
  return { ...resolved, bulletId };
}

export function resolveEvidenceBindingInputs(
  snapshot: ResumeSourceSnapshot,
  inputs: readonly EvidenceBindingInput[],
  bulletIdFor: (index: number) => string,
): BulletEvidenceBinding[] {
  const candidates = candidateMap(snapshot);
  return inputs.map((input, index) => {
    const resolved = resolveExcerpts(input, candidates);
    assertSupportedNumbers(input.bulletText, resolved.excerpts, candidates);
    return { ...resolved, bulletId: bulletIdFor(index) };
  });
}

export function resolveEvidenceReference(
  snapshot: ResumeSourceSnapshot,
  input: EvidenceBindingInput,
): Omit<BulletEvidenceBinding, "bulletId"> {
  const candidates = candidateMap(snapshot);
  const resolved = resolveExcerpts(input, candidates);
  assertSupportedNumbers(input.bulletText, resolved.excerpts, candidates);
  return resolved;
}

/**
 * Resolves a full patch batch (plain and incremental operations) into the
 * internal operation form. Incremental edits become `replace_bullet` with the
 * merged evidence binding, so the whole batch goes through the same atomic
 * application, EvidenceLedger replay, and single Chromium compile.
 */
export function resolveOperations(
  snapshot: ResumeSourceSnapshot,
  structure: ResumeStructure,
  bindings: readonly BulletEvidenceBinding[],
  operations: readonly ResumePatchOperationInput[],
): ResumePatchOperation[] {
  const candidates = candidateMap(snapshot);
  const work = new Map(bindings.map((binding) => [binding.bulletId, binding]));
  const nextId = nextBulletIdFactory(structure);
  const resolved: ResumePatchOperation[] = [];
  for (const operation of operations) {
    if (operation.op === "add_bullet") {
      const input = operation.binding;
      const binding = resolveExcerpts(input, candidates);
      assertSupportedNumbers(input.bulletText, binding.excerpts, candidates);
      const withId = { ...binding, bulletId: nextId() };
      assertNoRangeConflicts(work, withId, candidates);
      work.set(withId.bulletId, withId);
      const itemId = operation.itemId ?? `item-${withId.sourceExperienceId}`;
      resolved.push({ ...operation, itemId, binding: withId });
      continue;
    }
    if (operation.op === "replace_bullet") {
      const input = operation.binding;
      const binding = resolveExcerpts(input, candidates);
      assertSupportedNumbers(input.bulletText, binding.excerpts, candidates);
      const withId = { ...binding, bulletId: operation.bulletId };
      work.set(withId.bulletId, withId);
      resolved.push({ ...operation, binding: withId });
      continue;
    }
    if (
      operation.op === "append_text" ||
      operation.op === "prepend_text" ||
      operation.op === "insert_text" ||
      operation.op === "replace_substring"
    ) {
      const original = requireBinding(work, operation.bulletId);
      const mergedText = applyIncrementalText(original.bulletText, operation);
      const added = resolveExcerpts(
        { bulletText: mergedText, evidenceIds: operation.evidenceIds },
        candidates,
      );
      if (added.sourceExperienceId !== original.sourceExperienceId) {
        throw new EvidenceValidationError(
          "excerpt_experience_mismatch",
          `Incremental text for bullet ${operation.bulletId} cites evidence from ${added.sourceExperienceId} but the bullet belongs to ${original.sourceExperienceId}.`,
          operation.bulletId,
        );
      }
      const merged: BulletEvidenceBinding = {
        bulletId: original.bulletId,
        sourceExperienceId: original.sourceExperienceId,
        bulletText: mergedText,
        excerpts: [...original.excerpts, ...added.excerpts],
        matchedRequirementIds: [
          ...new Set([...original.matchedRequirementIds, ...added.matchedRequirementIds]),
        ],
      };
      assertSupportedNumbers(merged.bulletText, merged.excerpts, candidates);
      assertNoRangeConflicts(work, merged, candidates);
      work.set(merged.bulletId, merged);
      resolved.push({ op: "replace_bullet", bulletId: merged.bulletId, binding: merged });
      continue;
    }
    if (operation.op === "trim_text") {
      const original = requireBinding(work, operation.bulletId);
      const trimmed = [...original.bulletText].slice(0, operation.keepChars).join("");
      if (!trimmed) {
        throw new ResumeWorkspaceError(
          "invalid_patch_operation",
          `trim_text for bullet ${operation.bulletId} would leave an empty bullet.`,
        );
      }
      const merged = { ...original, bulletText: trimmed };
      work.set(merged.bulletId, merged);
      resolved.push({ op: "replace_bullet", bulletId: merged.bulletId, binding: merged });
      continue;
    }
    if (operation.op === "remove_bullet") {
      work.delete(operation.bulletId);
    }
    resolved.push(operation);
  }
  return resolved;
}

function requireBinding(
  bindings: ReadonlyMap<string, BulletEvidenceBinding>,
  bulletId: string,
): BulletEvidenceBinding {
  const binding = bindings.get(bulletId.trim());
  if (!binding) {
    throw new ResumeWorkspaceError(
      "bullet_not_found",
      `Bullet ${bulletId} is not in the current candidate.`,
    );
  }
  return binding;
}

function nextBulletIdFactory(structure: ResumeStructure): () => string {
  const suffixes = structure.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.bullets.flatMap((bullet) => {
        const match = /-(\d+)$/.exec(bullet.id);
        return match ? [Number.parseInt(match[1]!, 10)] : [];
      }),
    ),
  );
  const maxSuffix = suffixes.length ? Math.max(...suffixes) : -1;
  let index = 0;
  return () => `bl-${maxSuffix + 1 + index++}`;
}
