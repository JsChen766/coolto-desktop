import { workspaceEvidenceRecords } from "./agent-workspace-evidence.js";
import type { ResumeWorkspace } from "./types.js";

export interface SemanticTailEvidence {
  evidenceId: string;
  text: string;
}

export function availableSemanticTailEvidence(
  workspace: ResumeWorkspace,
  bulletId: string,
): SemanticTailEvidence[] {
  if (workspace.workUnitMap?.status === "ready") return [];
  const owner = bulletExperienceId(workspace, bulletId);
  const used = new Set((workspace.bulletProvenance ?? [])
    .flatMap((entry) => entry.evidenceIds));
  return workspaceEvidenceRecords(
    workspace.sourceSnapshot,
    workspace.supplementalEvidence,
  ).filter((record) => record.experienceId === owner && !used.has(record.evidenceId))
    .map(({ evidenceId, text }) => ({ evidenceId, text }));
}

export function resolveSemanticTailEvidence(input: {
  workspace: ResumeWorkspace;
  bulletId: string;
  additionalEvidenceIds?: readonly string[];
}): { evidenceIds: string[]; sourceQuotes: string[] } {
  const provenance = (input.workspace.bulletProvenance ?? []).find(
    (entry) => entry.bulletId === input.bulletId,
  );
  if (!provenance) throw new Error(`bullet ${input.bulletId} 缺少来源记录`);
  const additional = [...new Set(
    (input.additionalEvidenceIds ?? []).map((id) => id.trim()).filter(Boolean),
  )];
  const available = new Map(availableSemanticTailEvidence(
    input.workspace,
    input.bulletId,
  ).map((entry) => [entry.evidenceId, entry]));
  const unknown = additional.filter((id) => !available.has(id));
  if (unknown.length) {
    throw new Error(`尾行改写引用了不可用的新 evidenceId：${unknown.join("、")}`);
  }
  const records = new Map(workspaceEvidenceRecords(
    input.workspace.sourceSnapshot,
    input.workspace.supplementalEvidence,
  ).map((entry) => [entry.evidenceId, entry]));
  const evidenceIds = [...new Set([...provenance.evidenceIds, ...additional])];
  return {
    evidenceIds,
    sourceQuotes: evidenceIds.flatMap((id) => {
      const record = records.get(id);
      return record ? [record.text] : [];
    }),
  };
}

function bulletExperienceId(workspace: ResumeWorkspace, bulletId: string): string {
  const item = workspace.structure.sections.flatMap((section) => section.items)
    .find((candidate) => candidate.bullets.some((bullet) => bullet.id === bulletId));
  if (!item?.source_experience_id) {
    throw new Error(`bullet ${bulletId} 缺少对应经历`);
  }
  return item.source_experience_id;
}
