import { extractEvidenceNumbers } from "../evidence-numbers.js";
import { splitEvidenceRanges } from "../evidence-ranges.js";
import type {
  BulletEvidenceBinding,
  ResumeSourceExperienceSnapshot,
  ResumeSourceSnapshot,
} from "../source-types.js";
import type { ResumeSectionItem } from "../types.js";
import type { ResumeSupplementalEvidence } from "./types.js";

export interface WorkspaceEvidenceRecord {
  evidenceId: string;
  experienceId: string;
  text: string;
  excerpt?: BulletEvidenceBinding["excerpts"][number];
}

export function workspaceEvidenceRecords(
  snapshot: ResumeSourceSnapshot,
  supplemental: readonly ResumeSupplementalEvidence[] = [],
): WorkspaceEvidenceRecord[] {
  return [
    ...snapshot.experiences.flatMap(experienceEvidence),
    ...supplemental.map((evidence) => ({
      evidenceId: evidence.evidenceId,
      experienceId: evidence.experienceId,
      text: evidence.text,
    })),
  ];
}

export function evidenceForModel(
  snapshot: ResumeSourceSnapshot,
  supplemental: readonly ResumeSupplementalEvidence[] = [],
): Array<{ evidenceId: string; experienceId: string; text: string }> {
  return workspaceEvidenceRecords(snapshot, supplemental).map(
    ({ evidenceId, experienceId, text }) => ({
      evidenceId,
      experienceId,
      text,
    }),
  );
}

export function resolveGroundedEvidence(input: {
  snapshot: ResumeSourceSnapshot;
  supplemental: readonly ResumeSupplementalEvidence[];
  item: ResumeSectionItem;
  bulletId: string;
  text: string;
  evidenceIds: readonly string[];
  requirementIds: readonly string[];
}): { binding?: BulletEvidenceBinding; evidenceIds: string[] } {
  const ids = [...new Set(input.evidenceIds.map((value) => value.trim()))];
  if (!ids.length || ids.some((value) => !value)) {
    throw new Error("grounded bullet 必须引用至少一个有效 evidenceId");
  }
  const byId = new Map(
    workspaceEvidenceRecords(input.snapshot, input.supplemental).map(
      (record) => [record.evidenceId, record],
    ),
  );
  let records = ids.map((id) => {
    const record = byId.get(id);
    if (!record) throw new Error(`未知 evidenceId：${id}`);
    return record;
  });
  const skillItem = input.item.id.startsWith("item-skills-");
  if (
    !skillItem &&
    records.some(
      (record) => record.experienceId !== input.item.source_experience_id,
    )
  ) {
    throw new Error(`引用的 evidence 不属于 item ${input.item.id}`);
  }
  records = coverGroundedNumbers(
    input.text,
    records,
    [...byId.values()],
    skillItem ? undefined : input.item.source_experience_id ?? undefined,
  );
  const excerpts = records.flatMap((record) => record.excerpt ?? []);
  const sourceExperienceId =
    input.item.source_experience_id ?? records[0]!.experienceId;
  return {
    evidenceIds: records.map((record) => record.evidenceId),
    ...(excerpts.length
      ? {
          binding: {
            bulletId: input.bulletId,
            sourceExperienceId,
            bulletText: input.text,
            excerpts,
            matchedRequirementIds: [...input.requirementIds],
            ...(skillItem ? { sharedEvidence: true } : {}),
          },
        }
      : {}),
  };
}

function experienceEvidence(
  experience: Readonly<ResumeSourceExperienceSnapshot>,
): WorkspaceEvidenceRecord[] {
  return splitEvidenceRanges(experience.content).map((range) => ({
    evidenceId: `${experience.id}:${range.start}:${range.end}`,
    experienceId: experience.id,
    text: range.text,
    excerpt: {
      experienceId: experience.id,
      revisionId: experience.revisionId,
      revisionContentHash: experience.contentHash,
      sourceStart: range.start,
      sourceEnd: range.end,
      sourceQuote: range.text,
    },
  }));
}

function coverGroundedNumbers(
  text: string,
  cited: WorkspaceEvidenceRecord[],
  candidates: WorkspaceEvidenceRecord[],
  experienceId?: string,
): WorkspaceEvidenceRecord[] {
  const records = [...cited];
  let missing = missingNumbers(text, records);
  for (const value of missing) {
    const covering = candidates.find((candidate) =>
      !records.some((record) => record.evidenceId === candidate.evidenceId) &&
      (!experienceId || candidate.experienceId === experienceId) &&
      extractEvidenceNumbers(candidate.text).includes(value),
    );
    if (covering) records.push(covering);
  }
  missing = missingNumbers(text, records);
  if (missing.length) {
    throw new Error(`bullet 中的数字缺少来源：${missing.join("、")}`);
  }
  return records;
}

function missingNumbers(
  text: string,
  records: readonly WorkspaceEvidenceRecord[],
): string[] {
  const supported = extractEvidenceNumbers(
    records.map((record) => record.text).join("\n"),
  );
  return [
    ...new Set(
      extractEvidenceNumbers(text).filter((value) => !supported.includes(value)),
    ),
  ];
}
