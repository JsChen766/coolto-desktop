import type { ResumeWorkspace } from "./types.js";

export interface SupplementalIntegrationTarget {
  itemId: string;
  experienceId: string;
  requiredEdit: string;
  currentBullets: Array<{
    bulletId: string;
    text: string;
    origin: "grounded" | "agent_augmented";
    evidenceIds: string[];
    requirementIds: string[];
  }>;
  supplementalEvidence: Array<{ evidenceId: string; text: string }>;
}

/** Each supplemented experience must contribute at least one formal bullet fact. */
export function supplementalIntegrationTargets(
  workspace: ResumeWorkspace,
): SupplementalIntegrationTarget[] {
  const supplemental = workspace.supplementalEvidence ?? [];
  if (!supplemental.length) return [];
  const used = new Set((workspace.bulletProvenance ?? []).flatMap(
    (entry) => entry.evidenceIds,
  ));
  const pendingExperiences = new Set(supplemental
    .filter((entry) => !used.has(entry.evidenceId))
    .map((entry) => entry.experienceId)
    .filter((experienceId) => !supplemental.some((entry) =>
      entry.experienceId === experienceId && used.has(entry.evidenceId)
    )));
  if (!pendingExperiences.size) return [];
  const provenance = new Map((workspace.bulletProvenance ?? []).map(
    (entry) => [entry.bulletId, entry],
  ));
  return workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => {
      const experienceId = item.source_experience_id;
      if (!experienceId || !pendingExperiences.has(experienceId)) return [];
      return [{
        itemId: item.id,
        experienceId,
        requiredEdit:
          "一次完整重交 currentBullets：保留仍有价值的现有 bullet，并把至少一条 supplementalEvidence 的具体事实自然写入最相关 bullet；该 bullet 的 evidenceIds 必须加入对应 supplemental evidenceId。不得只为过门禁机械追加原句。",
        currentBullets: item.bullets.map((bullet) => {
          const source = provenance.get(bullet.id);
          return {
            bulletId: bullet.id,
            text: bullet.text,
            origin: source?.origin ?? "grounded",
            evidenceIds: [...(source?.evidenceIds ?? [])],
            requirementIds: [...(source?.requirementIds ?? [])],
          };
        }),
        supplementalEvidence: supplemental.filter((entry) =>
          entry.experienceId === experienceId && !used.has(entry.evidenceId)
        ).map(({ evidenceId, text }) => ({ evidenceId, text })),
      }];
    })
  );
}
