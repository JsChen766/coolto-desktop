import { workspaceEvidenceRecords } from "./agent-workspace-evidence.js";
import { SEMANTIC_LINE_EXPANSION_REQUIRED_EDIT } from "./semantic-line-expansion-instruction.js";
import type { ResumeWorkspace } from "./types.js";

const MAX_LINE_EXPANSIONS_PER_BATCH = 8;

export interface LineExpansionTarget {
  requiredEdit: string;
  bulletId: string;
  currentText: string;
  currentLines: number;
  evidenceIds: string[];
  sourceQuotes: string[];
}

/** Bounded structural targets; the Agent decides which facts are relevant. */
export function lineExpansionTargets(
  workspace: ResumeWorkspace,
): LineExpansionTarget[] {
  const maximumLines = workspace.maxBulletLines ?? 3;
  const provenanceById = new Map(
    (workspace.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  const textById = new Map(
    workspace.structure.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.bullets.map((bullet) => [bullet.id, bullet.text] as const),
      ),
    ),
  );
  const evidenceById = new Map(
    workspaceEvidenceRecords(
      workspace.sourceSnapshot,
      workspace.supplementalEvidence,
    ).map((record) => [record.evidenceId, record.text]),
  );
  return workspace.compileResult.bullets.flatMap((bullet) => {
    const currentText = textById.get(bullet.bulletId);
    if (!currentText || bullet.lineCount >= maximumLines) return [];
    const evidenceIds = provenanceById.get(bullet.bulletId)?.evidenceIds ?? [];
    const sourceQuotes = evidenceIds.flatMap((id) => {
      const quote = evidenceById.get(id);
      return quote ? [quote] : [];
    });
    if (sourceQuotes.length === 0) return [];
    return [{
      target: {
        requiredEdit: SEMANTIC_LINE_EXPANSION_REQUIRED_EDIT,
        bulletId: bullet.bulletId,
        currentText,
        currentLines: bullet.lineCount,
        evidenceIds,
        sourceQuotes,
      },
      expansionCapacity: [...sourceQuotes.join("")].length -
        [...currentText].length,
    }];
  }).sort((left, right) =>
    left.target.currentLines - right.target.currentLines ||
    right.expansionCapacity - left.expansionCapacity ||
    left.target.bulletId.localeCompare(right.target.bulletId)
  ).slice(0, MAX_LINE_EXPANSIONS_PER_BATCH).map(({ target }) => target);
}
