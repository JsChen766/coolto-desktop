import { EvidenceValidationError } from "../evidence-validation.js";
import type { ResumeSourceSnapshot } from "../source-types.js";
import type { BulletEvidenceBinding } from "../source-types.js";
import {
  findRepeatedFragment,
  stripEvidenceQuotes,
} from "../planning/text-repetition.js";
import { ResumeWorkspaceError } from "./errors.js";
import { resolveBindingWithAutoRepair } from "./evidence-auto-repair.js";
import type { EvidenceRepairAction } from "./evidence-auto-repair.js";
import { applyIncrementalText } from "./incremental-text-edit.js";
import type { ResumeStructure } from "../types.js";
import type {
  ResumePatchOperation,
  ResumePatchOperationInput,
} from "./types.js";
import { candidateMap } from "./evidence-binding-resolver.js";

/**
 * Resolves one model-facing operation against the evolving work map. All
 * operation-level failures throw; the caller decides whether they abort the
 * batch or are collected as per-operation rejections.
 */
export function resolveSingleOperation(
  snapshot: ResumeSourceSnapshot,
  work: Map<string, BulletEvidenceBinding>,
  structure: ResumeStructure,
  operation: ResumePatchOperationInput,
  candidates: ReturnType<typeof candidateMap>,
  nextId: () => string,
): { operation: ResumePatchOperation; repairs: EvidenceRepairAction[] } {
  if (operation.op === "add_bullet") {
    const repaired = resolveBindingWithAutoRepair(
      snapshot,
      operation.binding,
      nextId(),
      work,
    );
    const itemId = operation.itemId ?? `item-${repaired.binding.sourceExperienceId}`;
    assertItemOwnership(structure, itemId, repaired.binding.bulletId, repaired.binding.sourceExperienceId);
    work.set(repaired.binding.bulletId, repaired.binding);
    return {
      operation: { ...operation, itemId, binding: repaired.binding },
      repairs: repaired.repairs,
    };
  }
  if (operation.op === "replace_bullet") {
    const repaired = resolveBindingWithAutoRepair(
      snapshot,
      operation.binding,
      operation.bulletId,
      work,
    );
    assertItemOwnership(structure, bulletItemId(structure, operation.bulletId), operation.bulletId, repaired.binding.sourceExperienceId);
    work.set(repaired.binding.bulletId, repaired.binding);
    return {
      operation: { ...operation, binding: repaired.binding },
      repairs: repaired.repairs,
    };
  }
  if (
    operation.op === "append_text" ||
    operation.op === "prepend_text" ||
    operation.op === "insert_text" ||
    operation.op === "replace_substring"
  ) {
    return resolveIncrementalText(snapshot, work, operation);
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
    return {
      operation: { op: "replace_bullet", bulletId: merged.bulletId, binding: merged },
      repairs: [],
    };
  }
  if (operation.op === "remove_bullet") {
    work.delete(operation.bulletId);
  }
  return { operation, repairs: [] };
}

function resolveIncrementalText(
  snapshot: ResumeSourceSnapshot,
  work: Map<string, BulletEvidenceBinding>,
  operation: Extract<
    ResumePatchOperationInput,
    {
      op: "append_text" | "prepend_text" | "insert_text" | "replace_substring";
    }
  >,
): { operation: ResumePatchOperation; repairs: EvidenceRepairAction[] } {
  const original = requireBinding(work, operation.bulletId);
  const mergedText = applyIncrementalText(original.bulletText, operation);
  // Same repetition gates as write_bullet: appending/prepending/inserting
  // text that repeats a fragment already present in the bullet (e.g. when
  // the model re-cites evidence the bullet already contains) would look
  // broken in the final resume. Without this check the append path accepts
  // duplicated sentences that the write path rejects.
  const repeated = findRepeatedFragment(mergedText);
  if (repeated) {
    throw new EvidenceValidationError(
      "repeated_fragment",
      `Bullet ${operation.bulletId} would contain a repeated fragment "${repeated}"; do not retry the same text. Append a non-duplicating transition phrase (e.g. "，并持续优化。") or rephrase the bullet's own cited facts; no new numbers allowed.`,
      operation.bulletId,
    );
  }
  const originalIds = original.excerpts.map(
    (excerpt) =>
      `${excerpt.experienceId}:${excerpt.sourceStart}:${excerpt.sourceEnd}`,
  );
  const repaired = resolveBindingWithAutoRepair(
    snapshot,
    {
      bulletText: mergedText,
      evidenceIds: [...originalIds, ...operation.evidenceIds],
    },
    operation.bulletId,
    work,
  );
  if (repaired.binding.sourceExperienceId !== original.sourceExperienceId) {
    throw new EvidenceValidationError(
      "excerpt_experience_mismatch",
      `Incremental text for bullet ${operation.bulletId} cites evidence from ${repaired.binding.sourceExperienceId} but the bullet belongs to ${original.sourceExperienceId}.`,
      operation.bulletId,
    );
  }
  // Cross-bullet repetition mirrors write_bullet: evidence source quotes are
  // stripped first so two bullets citing different ranges of the same
  // experience never deadlock on shared source sentences.
  const strippedMerged = stripEvidenceQuotes(
    mergedText,
    repaired.binding.excerpts,
  );
  const strippedOthers = [...work.entries()]
    .filter(([bulletId]) => bulletId !== operation.bulletId.trim())
    .map(([, binding]) => stripEvidenceQuotes(binding.bulletText, binding.excerpts));
  const crossRepeat = findRepeatedFragment(
    [...strippedOthers, strippedMerged].join("\n"),
    20,
  );
  if (crossRepeat) {
    throw new EvidenceValidationError(
      "repeated_fragment",
      `Bullet ${operation.bulletId} would repeat wording already used in another bullet ("${crossRepeat}"); reword it. If the experience evidence is exhausted, stop filling and enter review.`,
      operation.bulletId,
    );
  }
  work.set(repaired.binding.bulletId, repaired.binding);
  return {
    operation: {
      op: "replace_bullet",
      bulletId: repaired.binding.bulletId,
      binding: repaired.binding,
    },
    repairs: repaired.repairs,
  };
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

function assertItemOwnership(
  structure: ResumeStructure,
  itemId: string,
  bulletId: string,
  sourceExperienceId: string,
): void {
  const item = findItem(structure, itemId);
  if (itemId.startsWith("item-skills-")) return;
  if (item.source_experience_id !== sourceExperienceId) {
    throw new ResumeWorkspaceError(
      "bullet_source_mismatch",
      `Bullet ${bulletId} does not belong to item ${itemId}.`,
    );
  }
}

function bulletItemId(structure: ResumeStructure, bulletId: string): string {
  for (const section of structure.sections) {
    for (const item of section.items) {
      if (item.bullets.some((bullet) => bullet.id === bulletId.trim())) {
        return item.id;
      }
    }
  }
  throw new ResumeWorkspaceError(
    "bullet_not_found",
    `Bullet ${bulletId} was not found.`,
  );
}

function findItem(
  structure: ResumeStructure,
  itemId: string,
): ResumeStructure["sections"][number]["items"][number] {
  for (const section of structure.sections) {
    const item = section.items.find((candidate) => candidate.id === itemId.trim());
    if (item) return item;
  }
  throw new ResumeWorkspaceError("item_not_found", `Item ${itemId} was not found.`);
}

export function nextBulletIdFactory(structure: ResumeStructure): () => string {
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
