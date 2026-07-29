import type { ExperienceSummary } from "../api/types.js";

export type ExperienceEvidenceBlock =
  | "deleted"
  | "archived"
  | "conflict"
  | "failed";

export type ExperienceEvidenceEligibility =
  | { eligible: true; syncStatus: "clean" | "pending" }
  | { eligible: false; reason: ExperienceEvidenceBlock };

export function experienceEvidenceEligibility(
  experience: ExperienceSummary,
): ExperienceEvidenceEligibility {
  if (experience.deletedAt !== null) return { eligible: false, reason: "deleted" };
  if (experience.status !== "active") return { eligible: false, reason: "archived" };
  const status = experience.syncStatus ?? "clean";
  if (status === "conflict") return { eligible: false, reason: "conflict" };
  if (status === "failed") return { eligible: false, reason: "failed" };
  return { eligible: true, syncStatus: status };
}

export function assertExperienceEvidenceEligible(
  experience: ExperienceSummary,
): void {
  const result = experienceEvidenceEligibility(experience);
  if (!result.eligible) {
    throw new Error(`Experience ${experience.id} cannot be used as evidence: ${result.reason}`);
  }
}
