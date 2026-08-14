import { ResumeWorkspaceError } from "./errors.js";
import type { BulletEvidenceBinding } from "../source-types.js";
import type { ResumeStructure } from "../types.js";

export function requireBinding(
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

export function assertItemOwnership(
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

export function bulletItemId(structure: ResumeStructure, bulletId: string): string {
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
