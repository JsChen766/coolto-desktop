import type { ResumeSourceSnapshot } from "../source-types.js";
import type { ResumeStructure } from "../types.js";
import type { ResumeWorkspace } from "./types.js";

export function retainContentAcrossSourceExpansion(
  fresh: ResumeStructure,
  previous: ResumeWorkspace,
  nextSnapshot: ResumeSourceSnapshot,
) {
  const unchangedExperiences = unchangedExperienceIds(
    previous.sourceSnapshot,
    nextSnapshot,
  );
  const previousItems = new Map(
    previous.structure.sections.flatMap((section) =>
      section.items.map((item) => [item.id, item] as const),
    ),
  );
  const structure = structuredClone(fresh);
  const retainedBulletIds = new Set<string>();
  for (const section of structure.sections) {
    for (const item of section.items) {
      if (!item.source_experience_id) continue;
      if (!unchangedExperiences.has(item.source_experience_id)) continue;
      const prior = previousItems.get(item.id);
      if (!prior) continue;
      item.bullets = structuredClone(prior.bullets);
      item.bullets.forEach((bullet) => retainedBulletIds.add(bullet.id));
    }
  }
  const bindings = previous.bindings.filter((binding) =>
    retainedBulletIds.has(binding.bulletId),
  );
  const bulletProvenance = (previous.bulletProvenance ?? []).filter(
    (entry) => retainedBulletIds.has(entry.bulletId),
  );
  const augmentedBullets = (previous.augmentedBullets ?? []).filter(
    (entry) => retainedBulletIds.has(entry.bulletId),
  );
  const augmentedFragments = (previous.augmentedFragments ?? []).filter(
    (entry) => retainedBulletIds.has(entry.bulletId),
  );
  const pending = hasPendingConfirmation(
    bulletProvenance,
    augmentedFragments,
  );
  return {
    structure,
    bindings: structuredClone(bindings),
    bulletProvenance: structuredClone(bulletProvenance),
    augmentedBullets: structuredClone(augmentedBullets),
    augmentedFragments: structuredClone(augmentedFragments),
    awaitingUserConfirmation: pending
      ? structuredClone(previous.awaitingUserConfirmation ?? {
          note: "agent_augmented content requires confirmation",
        })
      : null,
  };
}

function unchangedExperienceIds(
  previous: ResumeSourceSnapshot,
  next: ResumeSourceSnapshot,
): Set<string> {
  const before = new Map(
    previous.experiences.map((experience) => [experience.id, experience]),
  );
  return new Set(next.experiences.flatMap((experience) => {
    const prior = before.get(experience.id);
    return prior &&
      prior.revisionId === experience.revisionId &&
      prior.contentHash === experience.contentHash
      ? [experience.id]
      : [];
  }));
}

function hasPendingConfirmation(
  provenance: NonNullable<ResumeWorkspace["bulletProvenance"]>,
  fragments: NonNullable<ResumeWorkspace["augmentedFragments"]>,
): boolean {
  return provenance.some((entry) => entry.confirmation === "pending") ||
    fragments.some((entry) => entry.confirmation === "pending");
}
