import type { ResumeSourceSnapshotBuilder } from
  "../../resume/source-snapshot.js";
import { buildResumeSkeleton } from
  "../../resume/workspace/candidate-skeleton.js";
import { userDirectedTierInputs } from
  "../../resume/workspace/selection-policy.js";
import {
  applyLocalizedPositions,
  assertUniqueExperienceIds,
} from "./create-workspace-structure.js";
import { buildWorkspaceSource } from "./create-workspace-strategy.js";

interface ExperienceSelectionInput {
  experienceId: string;
  tier?: string | null;
  localizedPosition?: string;
}

export async function prepareWorkspaceSelection(input: {
  snapshotBuilder: ResumeSourceSnapshotBuilder;
  generationStrategy?: "tailored" | "general";
  selectionPolicy?: "relevance" | "user_directed";
  jdId?: string;
  language: "zh-CN" | "en-US";
  experiences: readonly ExperienceSelectionInput[];
  focusExperienceId?: string;
  hasBase: boolean;
}) {
  const selectionPolicy = input.selectionPolicy ?? "relevance";
  if (selectionPolicy === "user_directed" &&
    input.generationStrategy === "general") {
    throw new Error("user_directed 必须保留目标 JD，不能与 general 模式混用");
  }
  assertUniqueExperienceIds(input.experiences);
  const experienceIds = input.experiences.map((item) => item.experienceId);
  const { snapshot, availableExperienceIds } = await buildWorkspaceSource({
    snapshotBuilder: input.snapshotBuilder,
    ...(input.generationStrategy
      ? { generationStrategy: input.generationStrategy } : {}),
    ...(input.jdId ? { jdId: input.jdId } : {}),
    experienceIds,
    hasBase: input.hasBase,
  });
  const availableIds = new Set(availableExperienceIds);
  const availableInputs = input.experiences.filter((item) =>
    availableIds.has(item.experienceId)
  );
  const tierInputs = selectionPolicy === "user_directed"
    ? userDirectedTierInputs(availableInputs, input.focusExperienceId)
    : availableInputs;
  const freshStructure = buildResumeSkeleton(
    snapshot,
    availableExperienceIds,
    input.language,
  );
  applyLocalizedPositions(freshStructure, tierInputs);
  return {
    selectionPolicy,
    snapshot,
    availableExperienceIds,
    tierInputs,
    freshStructure,
  };
}
