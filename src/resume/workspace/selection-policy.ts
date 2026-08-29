import type { ResumeItemTier } from "./types.js";

export type ResumeSelectionPolicy = "relevance" | "user_directed";

export interface UserDirectedResumeSelection {
  experienceIds: string[];
  focusExperienceId: string | null;
}

export interface UserDirectedSelectionInput {
  experienceId: string;
  tier?: string | null;
  localizedPosition?: string;
}

export function userDirectedTierInputs<T extends UserDirectedSelectionInput>(
  inputs: readonly T[],
  focusExperienceId?: string,
): Array<T & { tier: ResumeItemTier }> {
  const focus = focusExperienceId?.trim();
  if (focus && !inputs.some((input) => input.experienceId === focus)) {
    throw new Error("focusExperienceId 必须属于用户指定的经历集合");
  }
  return inputs.map((input) => ({
    ...input,
    tier: focus === input.experienceId ? "main" : "secondary",
  }));
}

export function sameSelectionPolicy(
  workspace: {
    selectionPolicy?: ResumeSelectionPolicy;
    userDirectedSelection?: { focusExperienceId: string | null };
  },
  policy: ResumeSelectionPolicy,
  focusExperienceId?: string,
): boolean {
  return (workspace.selectionPolicy ?? "relevance") === policy &&
    (workspace.userDirectedSelection?.focusExperienceId ?? null) ===
      (focusExperienceId?.trim() || null);
}
