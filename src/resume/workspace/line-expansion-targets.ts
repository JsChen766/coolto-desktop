import { workspaceEvidenceRecords } from "./agent-workspace-evidence.js";
import { lineExpansionInstruction } from "./line-expansion-instruction.js";
import type { ResumeWorkspace } from "./types.js";

const MAX_LINE_EXPANSIONS_PER_BATCH = 8;

export interface LineExpansionTarget {
  bulletId: string;
  currentText: string;
  evidenceIds: string[];
  sourceQuotes: string[];
  currentCharacters: number;
  characterDelta: number;
  targetCharacters: number;
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
    const instruction = lineExpansionInstruction(currentText, bullet);
    if (!instruction) return [];
    const evidenceIds = provenanceById.get(bullet.bulletId)?.evidenceIds ?? [];
    const sourceQuotes = evidenceIds.flatMap((id) => {
      const quote = evidenceById.get(id);
      return quote ? [quote] : [];
    });
    return [{
      target: {
        bulletId: bullet.bulletId,
        currentText,
        evidenceIds,
        sourceQuotes,
        ...instruction,
      },
      expansionCapacity: sourceQuotes.join("").length -
        instruction.currentCharacters,
    }];
  }).sort((left, right) =>
    left.target.characterDelta - right.target.characterDelta ||
    right.expansionCapacity - left.expansionCapacity ||
    left.target.bulletId.localeCompare(right.target.bulletId)
  ).slice(0, MAX_LINE_EXPANSIONS_PER_BATCH).map(({ target }) => target);
}
