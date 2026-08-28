import { textSupportsRequirement } from "../quality/requirement-coverage.js";
import type { ResumeWorkspace } from "./types.js";

export function createReuseAdaptation(
  workspace: ResumeWorkspace,
): ResumeWorkspace["reuseAdaptation"] {
  const base = workspace.reuseBase;
  if (!base || base.sourceJdId === workspace.sourceSnapshot.jd.id) {
    return undefined;
  }
  const covered = coveredRequirementIds(workspace);
  const uncoveredRequirementIds = workspace.sourceSnapshot.jd.requirements
    .map((requirement) => requirement.id)
    .filter((id) => !covered.has(id));
  const targets = adaptationCandidates(workspace, uncoveredRequirementIds);
  return {
    status: "pending",
    sourceJdId: base.sourceJdId,
    targetJdId: workspace.sourceSnapshot.jd.id,
    retainedBulletIds: workspace.structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets.map((bullet) => bullet.id))
    ),
    targetItemIds: targets.slice(0, 1).map((target) => target.itemId),
    adaptedItemIds: [],
    uncoveredRequirementIds,
  };
}

export function reconcileReuseAdaptation(
  before: ResumeWorkspace,
  after: ResumeWorkspace,
  appliedItemIds: readonly string[],
): ResumeWorkspace {
  const adaptation = before.reuseAdaptation;
  if (!adaptation || adaptation.status !== "pending") return after;
  const changed = appliedItemIds.filter((itemId) =>
    itemSignature(before, itemId) !== itemSignature(after, itemId)
  );
  const adaptedItemIds = [...new Set([
    ...adaptation.adaptedItemIds,
    ...changed.filter((itemId) => adaptation.targetItemIds.includes(itemId)),
  ])];
  const covered = coveredRequirementIds(after);
  const requirements = after.sourceSnapshot.jd.requirements;
  const uncoveredRequirementIds = requirements
    .map((requirement) => requirement.id)
    .filter((id) => !covered.has(id));
  const completed = adaptation.targetItemIds.every((itemId) =>
    adaptedItemIds.includes(itemId)
  );
  return {
    ...after,
    reuseAdaptation: {
      ...adaptation,
      status: completed ? "completed" : "pending",
      adaptedItemIds,
      uncoveredRequirementIds,
      ...(completed ? { completedRevision: after.revision } : {}),
    },
  };
}

export function reuseAdaptationPending(workspace: ResumeWorkspace): boolean {
  return workspace.reuseAdaptation?.status === "pending";
}

function coveredRequirementIds(workspace: ResumeWorkspace): Set<string> {
  return new Set(workspace.bindings.flatMap((binding) =>
    binding.matchedRequirementIds
  ));
}

function adaptationCandidates(
  workspace: ResumeWorkspace,
  uncoveredRequirementIds: readonly string[],
) {
  const uncovered = workspace.sourceSnapshot.jd.requirements.filter(
    (requirement) => uncoveredRequirementIds.includes(requirement.id),
  );
  const sourceById = new Map(workspace.sourceSnapshot.experiences.map(
    (experience) => [experience.id, experience],
  ));
  const provenance = new Map((workspace.bulletProvenance ?? []).map(
    (entry) => [entry.bulletId, entry],
  ));
  return workspace.structure.sections.flatMap((section) =>
    ["education", "skills"].includes(section.type) ? [] : section.items.map(
      (item, order) => {
        const source = item.source_experience_id
          ? sourceById.get(item.source_experience_id) : undefined;
        const sourceText = source ? `${source.content} ${source.tags.join(" ")}` : "";
        const supported = uncovered.filter((requirement) =>
          textSupportsRequirement(requirement, sourceText)
        ).length;
        const unmatched = item.bullets.filter((bullet) =>
          !(provenance.get(bullet.id)?.requirementIds.length)
        ).length;
        const tier = workspace.itemTiers?.[item.id];
        return {
          itemId: item.id,
          eligible: !item.bullets.length || unmatched > 0 || supported > 0,
          score: supported * 100 + unmatched * 10 +
            (tier === "main" ? 5 : tier === "secondary" ? 2 : 0) - order / 100,
        };
      },
    )
  ).sort((left, right) =>
    Number(right.eligible) - Number(left.eligible) || right.score - left.score ||
    left.itemId.localeCompare(right.itemId)
  );
}

function itemSignature(workspace: ResumeWorkspace, itemId: string): string {
  const item = workspace.structure.sections.flatMap((section) =>
    section.items.filter((candidate) => candidate.id === itemId)
  )[0];
  return JSON.stringify(item?.bullets.map((bullet) => ({
    id: bullet.id,
    text: bullet.text,
  })) ?? null);
}
