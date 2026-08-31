import type { ResumeWorkspace } from "./types.js";

export function hasPendingAgentContent(
  provenance: NonNullable<ResumeWorkspace["bulletProvenance"]>,
  fragments: NonNullable<ResumeWorkspace["augmentedFragments"]>,
): boolean {
  return provenance.some((entry) => entry.confirmation === "pending") ||
    fragments.some((entry) => entry.confirmation === "pending");
}

export function assertSupplementalEvidenceUsedOnce(
  workspace: ResumeWorkspace,
  provenance: ResumeWorkspace["bulletProvenance"],
): void {
  const supplemental = new Set(
    (workspace.supplementalEvidence ?? []).map((entry) => entry.evidenceId),
  );
  const used = new Set<string>();
  for (const entry of provenance ?? []) {
    for (const evidenceId of entry.evidenceIds) {
      if (!supplemental.has(evidenceId)) continue;
      if (used.has(evidenceId)) {
        throw new Error(`用户补充 evidence 只能用于一条 bullet：${evidenceId}`);
      }
      used.add(evidenceId);
    }
  }
}

export function supplementalNumericEvidenceForBullet(
  workspace: ResumeWorkspace,
  provenance: ResumeWorkspace["bulletProvenance"],
  bulletId: string,
  experienceId: string,
): string {
  const source = [...(provenance ?? [])].reverse().find(
    (entry) => entry.bulletId === bulletId,
  );
  const cited = new Set(source?.evidenceIds ?? []);
  return (workspace.supplementalEvidence ?? [])
    .filter((entry) =>
      cited.has(entry.evidenceId) && entry.experienceId === experienceId
    )
    .map((entry) => entry.text)
    .join("\n");
}
