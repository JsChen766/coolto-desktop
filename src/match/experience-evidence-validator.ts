import { createHash } from "node:crypto";

import type { ExperienceReader } from "../api/types.js";
import { assertExperienceEvidenceEligible } from "../experience/evidence-eligibility.js";
import type { MatchReportExperienceReference } from "./types.js";

export async function validateMatchExperienceReferences(
  reader: ExperienceReader,
  references: MatchReportExperienceReference[],
  signal?: AbortSignal,
): Promise<void> {
  const seen = new Set<string>();
  for (const reference of references) {
    if (seen.has(reference.experienceId)) {
      throw new Error(`Experience ${reference.experienceId} is duplicated`);
    }
    seen.add(reference.experienceId);
    const experience = await reader.getExperience(reference.experienceId, signal);
    assertExperienceEvidenceEligible(experience);
    const revision = experience.currentRevision;
    if (
      !revision ||
      revision.id !== reference.revisionId ||
      hash(revision.content) !== reference.contentHash
    ) {
      throw new Error(
        `Experience ${reference.experienceId} no longer matches the frozen revision`,
      );
    }
  }
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
