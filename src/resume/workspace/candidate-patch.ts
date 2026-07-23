import { EvidenceLedger } from "../evidence-ledger.js";
import { normalizeEvidenceBinding } from "../evidence-validation.js";
import type {
  BulletEvidenceBinding,
  ResumeSourceSnapshot,
} from "../source-types.js";
import type { ResumeSectionItem, ResumeStructure } from "../types.js";
import { ResumeWorkspaceError } from "./errors.js";
import type { ResumePatchOperation } from "./types.js";

export interface PatchedResumeCandidate {
  structure: ResumeStructure;
  bindings: BulletEvidenceBinding[];
}

export function applyCandidatePatch(
  snapshot: ResumeSourceSnapshot,
  sourceStructure: ResumeStructure,
  sourceBindings: readonly BulletEvidenceBinding[],
  operations: readonly ResumePatchOperation[],
): PatchedResumeCandidate {
  if (!operations.length) {
    throw new ResumeWorkspaceError(
      "invalid_patch_operation",
      "At least one resume patch operation is required.",
    );
  }
  const structure = structuredClone(sourceStructure);
  const bindings = new Map(
    sourceBindings.map((binding) => {
      const normalized = normalizeEvidenceBinding(binding);
      return [normalized.bulletId, normalized] as const;
    }),
  );
  for (const operation of operations) {
    if (operation.op === "add_bullet") {
      addBullet(structure, bindings, operation);
    } else if (operation.op === "replace_bullet") {
      replaceBullet(structure, bindings, operation.bulletId, operation.binding);
    } else if (operation.op === "remove_bullet") {
      removeBullet(structure, bindings, operation.bulletId);
    } else if (operation.op === "move_bullet") {
      moveBullet(structure, operation.bulletId, operation.afterBulletId);
    } else {
      throw new ResumeWorkspaceError(
        "invalid_patch_operation",
        "Unsupported resume patch operation.",
      );
    }
  }
  assertBindingCoverage(structure, bindings);
  const ledger = new EvidenceLedger(snapshot);
  for (const binding of bindings.values()) ledger.reserve(binding);
  return { structure, bindings: [...ledger.listBindings()] };
}

function addBullet(
  structure: ResumeStructure,
  bindings: Map<string, BulletEvidenceBinding>,
  operation: Extract<ResumePatchOperation, { op: "add_bullet" }>,
): void {
  const item = findItem(structure, operation.itemId);
  const binding = normalizeEvidenceBinding(operation.binding);
  if (bindings.has(binding.bulletId) || findBullet(structure, binding.bulletId)) {
    throw new ResumeWorkspaceError(
      "duplicate_bullet_id",
      `Bullet ${binding.bulletId} already exists.`,
    );
  }
  assertItemSource(item, binding);
  item.bullets.splice(
    insertionIndex(item, operation.afterBulletId),
    0,
    toResumeBullet(binding),
  );
  bindings.set(binding.bulletId, binding);
}

function replaceBullet(
  structure: ResumeStructure,
  bindings: Map<string, BulletEvidenceBinding>,
  rawBulletId: string,
  inputBinding: BulletEvidenceBinding,
): void {
  const bulletId = rawBulletId.trim();
  const located = requireBullet(structure, bulletId);
  const binding = normalizeEvidenceBinding(inputBinding);
  if (binding.bulletId !== bulletId) {
    throw new ResumeWorkspaceError(
      "invalid_patch_operation",
      "A replacement binding must keep the target bullet ID.",
    );
  }
  assertItemSource(located.item, binding);
  located.item.bullets[located.index] = toResumeBullet(binding);
  bindings.set(bulletId, binding);
}

function removeBullet(
  structure: ResumeStructure,
  bindings: Map<string, BulletEvidenceBinding>,
  rawBulletId: string,
): void {
  const bulletId = rawBulletId.trim();
  const located = requireBullet(structure, bulletId);
  located.item.bullets.splice(located.index, 1);
  bindings.delete(bulletId);
}

function moveBullet(
  structure: ResumeStructure,
  rawBulletId: string,
  afterBulletId?: string | null,
): void {
  const bulletId = rawBulletId.trim();
  const located = requireBullet(structure, bulletId);
  const [bullet] = located.item.bullets.splice(located.index, 1);
  if (!bullet) throw new ResumeWorkspaceError("bullet_not_found", bulletId);
  located.item.bullets.splice(insertionIndex(located.item, afterBulletId), 0, bullet);
}

function insertionIndex(
  item: ResumeSectionItem,
  afterBulletId?: string | null,
): number {
  if (afterBulletId === null) return 0;
  if (afterBulletId === undefined) return item.bullets.length;
  const index = item.bullets.findIndex(
    (bullet) => bullet.id === afterBulletId.trim(),
  );
  if (index < 0) {
    throw new ResumeWorkspaceError(
      "bullet_not_found",
      `Anchor bullet ${afterBulletId} is not in the target item.`,
    );
  }
  return index + 1;
}

function findItem(structure: ResumeStructure, itemId: string): ResumeSectionItem {
  for (const section of structure.sections) {
    const item = section.items.find((candidate) => candidate.id === itemId.trim());
    if (item) return item;
  }
  throw new ResumeWorkspaceError("item_not_found", `Item ${itemId} was not found.`);
}

function findBullet(
  structure: ResumeStructure,
  bulletId: string,
): { item: ResumeSectionItem; index: number } | undefined {
  for (const section of structure.sections) {
    for (const item of section.items) {
      const index = item.bullets.findIndex((bullet) => bullet.id === bulletId);
      if (index >= 0) return { item, index };
    }
  }
  return undefined;
}

function requireBullet(
  structure: ResumeStructure,
  bulletId: string,
): { item: ResumeSectionItem; index: number } {
  const located = findBullet(structure, bulletId);
  if (!located) {
    throw new ResumeWorkspaceError(
      "bullet_not_found",
      `Bullet ${bulletId} was not found.`,
    );
  }
  return located;
}

function assertItemSource(
  item: ResumeSectionItem,
  binding: BulletEvidenceBinding,
): void {
  if (item.source_experience_id !== binding.sourceExperienceId) {
    throw new ResumeWorkspaceError(
      "bullet_source_mismatch",
      `Bullet ${binding.bulletId} does not belong to item ${item.id}.`,
    );
  }
}

function toResumeBullet(binding: BulletEvidenceBinding) {
  return {
    id: binding.bulletId,
    text: binding.bulletText,
    matched_jd_requirement_ids: [...binding.matchedRequirementIds],
  };
}

function assertBindingCoverage(
  structure: ResumeStructure,
  bindings: ReadonlyMap<string, BulletEvidenceBinding>,
): void {
  const bulletIds = structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets.map((bullet) => bullet.id)),
  );
  if (
    bulletIds.length !== bindings.size ||
    new Set(bulletIds).size !== bulletIds.length ||
    bulletIds.some((id) => !bindings.has(id))
  ) {
    throw new ResumeWorkspaceError(
      "invalid_patch_operation",
      "Every candidate bullet must have exactly one evidence binding.",
    );
  }
}
