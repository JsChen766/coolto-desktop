import { workspaceEvidenceRecords } from "./agent-workspace-evidence.js";
import { SEMANTIC_LINE_EXPANSION_REQUIRED_EDIT } from "./semantic-line-expansion-instruction.js";
import type { ResumeItemTier, ResumeWorkspace } from "./types.js";

export const MIN_TIERED_BULLET_LINES = 2;
export const MAX_TIERED_BULLET_LINES = 3;

export interface BulletDepthRewriteTarget {
  requiredEdit: string;
  bulletId: string;
  itemId: string;
  tier: Extract<ResumeItemTier, "main" | "secondary">;
  currentText: string;
  currentLines: number;
  evidenceIds: string[];
  sourceQuotes: string[];
}

/** Every measured tiered bullet that still needs to reach the 2–3 line gate. */
export function bulletDepthRewriteTargets(
  workspace: ResumeWorkspace,
): BulletDepthRewriteTarget[] {
  const measurements = new Map(
    workspace.compileResult.bullets.map((bullet) => [bullet.bulletId, bullet]),
  );
  const provenance = new Map(
    (workspace.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  const evidence = new Map(
    workspaceEvidenceRecords(
      workspace.sourceSnapshot,
      workspace.supplementalEvidence,
    ).map((record) => [record.evidenceId, record.text]),
  );
  return workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => {
      const tier = workspace.itemTiers?.[item.id];
      if (tier !== "main" && tier !== "secondary") return [];
      return item.bullets.flatMap((bullet) => {
        const observed = measurements.get(bullet.id);
        if (!observed || observed.lineCount >= MIN_TIERED_BULLET_LINES) return [];
        const evidenceIds = provenance.get(bullet.id)?.evidenceIds ?? [];
        return [{
          requiredEdit: SEMANTIC_LINE_EXPANSION_REQUIRED_EDIT,
          bulletId: bullet.id,
          itemId: item.id,
          tier,
          currentText: bullet.text,
          currentLines: observed.lineCount,
          evidenceIds,
          sourceQuotes: evidenceIds.flatMap((id) => {
            const quote = evidence.get(id);
            return quote ? [quote] : [];
          }),
        }];
      });
    }),
  );
}

export function minimumBulletLines(
  workspace: ResumeWorkspace,
  bulletId: string,
): number {
  for (const section of workspace.structure.sections) {
    for (const item of section.items) {
      const tier = workspace.itemTiers?.[item.id];
      if (tier !== "main" && tier !== "secondary") continue;
      if (item.bullets.some((bullet) => bullet.id === bulletId)) {
        return MIN_TIERED_BULLET_LINES;
      }
    }
  }
  return 1;
}
