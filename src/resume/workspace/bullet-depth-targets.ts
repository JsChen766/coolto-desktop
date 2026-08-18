import { workspaceEvidenceRecords } from "./agent-workspace-evidence.js";
import {
  lineExpansionInstruction,
} from "./line-expansion-instruction.js";
import type { LineExpansionTarget } from "./line-expansion-targets.js";
import type { ResumeItemTier, ResumeWorkspace } from "./types.js";

export const MIN_TIERED_BULLET_LINES = 2;
export const MAX_TIERED_BULLET_LINES = 3;

export interface BulletDepthRewriteTarget extends LineExpansionTarget {
  itemId: string;
  tier: Extract<ResumeItemTier, "main" | "secondary">;
  currentLines: number;
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
        const instruction = lineExpansionInstruction(bullet.text, observed);
        if (!instruction) return [];
        return [{
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
          ...instruction,
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
