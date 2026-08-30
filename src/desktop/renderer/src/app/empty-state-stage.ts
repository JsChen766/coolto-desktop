import type { ResumeLibraryEntry } from "../../../../resume/library/types.js";

export type EmptyStateStage =
  | "experience_intake"
  | "general_resume"
  | "job_target"
  | "application"
  | "active_search";

export interface EmptyStateFacts {
  experienceCount: number;
  generalResumeCount: number;
  deliveryResumeFileCount: number;
  jdCount: number;
  applicationCount: number;
}

export function resolveEmptyStateStage(
  facts: EmptyStateFacts,
): EmptyStateStage {
  if (facts.experienceCount === 0) {
    return "experience_intake";
  }
  if (
    facts.generalResumeCount === 0 &&
    facts.deliveryResumeFileCount === 0 &&
    facts.jdCount === 0 &&
    facts.applicationCount === 0
  ) return "general_resume";
  if (facts.jdCount === 0) return "job_target";
  if (facts.applicationCount === 0) return "application";
  return "active_search";
}

export function isAvailableGeneralResume(
  entry: ResumeLibraryEntry,
): boolean {
  const cloudGeneral = Boolean(
    entry.cloud && entry.cloud.jdId === null && entry.cloud.status !== "archived",
  );
  const localGeneral = Boolean(
    entry.local?.generationStrategy === "general" &&
      entry.local.generationReady,
  );
  return cloudGeneral || localGeneral;
}
