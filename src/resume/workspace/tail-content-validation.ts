import { buildValidatedBullet } from "./agent-content-validation.js";
import type { ResumeWorkspace } from "./types.js";

/** Validates one candidate against the complete proposed tail batch. */
export function validateTailCandidateText(
  workspace: ResumeWorkspace,
  bulletId: string,
  text: string,
  candidateTexts: ReadonlyMap<string, string>,
  evidenceIds?: readonly string[],
): void {
  const provenance = (workspace.bulletProvenance ?? []).find(
    (entry) => entry.bulletId === bulletId,
  );
  for (const section of workspace.structure.sections) {
    for (const item of section.items) {
      const index = item.bullets.findIndex((bullet) => bullet.id === bulletId);
      if (index < 0 || !provenance) continue;
      const others = workspace.structure.sections.flatMap((candidateSection) =>
        candidateSection.items.flatMap((candidateItem) =>
          candidateItem.bullets.filter((bullet) => bullet.id !== bulletId)
            .map((bullet) => ({
              ...bullet,
              text: candidateTexts.get(bullet.id) ?? bullet.text,
            }))
        )
      );
      buildValidatedBullet({
        source: workspace,
        item,
        bullet: {
          bulletId,
          text,
          origin: provenance.origin,
          evidenceIds: [...(evidenceIds ?? provenance.evidenceIds)],
          ...(provenance.workUnitIds
            ? { workUnitIds: provenance.workUnitIds } : {}),
          requirementIds: provenance.requirementIds,
        },
        index,
        retainedIds: new Set(others.map((bullet) => bullet.id)),
        retainedTexts: others.map((bullet) => normalized(bullet.text)),
      });
      return;
    }
  }
  throw new Error(`bullet ${bulletId} 缺少来源记录，不能修改`);
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
