import { extractEvidenceNumbers } from "../../resume/evidence-numbers.js";
import type {
  BulletEvidenceBinding,
  ResumeSourceSnapshot,
} from "../../resume/source-types.js";
import { allEvidenceCandidates } from "../../resume/quality/evidence-candidates.js";
import type { ResumeSectionItem } from "../../resume/types.js";
import {
  findRepeatedFragment,
  stripEvidenceQuotes,
} from "../../resume/planning/text-repetition.js";
import { coverMissingNumbers } from "./bullet-number-coverage.js";

export const LENGTH_TOLERANCE = { min: 0.8, max: 1.15 };
export const MAX_EVIDENCE_PER_BULLET = 3;
/** Product floor for a single bullet; agent targets cannot go below it. */
export const LENGTH_DEFAULT_RANGE = { min: 75, max: 165 };

export interface BulletLengthTarget {
  min: number;
  max: number;
}

export type BulletValidationResult =
  | { ok: true; binding: BulletEvidenceBinding }
  | { ok: false; reason: string };

/**
 * Deterministic per-bullet validation for the agent-orchestrated writer.
 * Content-level checks only (length, numbers, repetition, evidence
 * membership/uniqueness); page-level budget checks stay deferred to the
 * compile step so parallel write_bullet calls never reject each other.
 */
export function validateAndBuildBullet(
  snapshot: ResumeSourceSnapshot,
  item: ResumeSectionItem,
  existingBindings: readonly BulletEvidenceBinding[],
  evidenceIds: readonly string[],
  bulletText: string,
  targetChars?: BulletLengthTarget,
  bulletId?: string,
): BulletValidationResult {
  const text = bulletText.trim();
  if (!text) {
    return { ok: false, reason: "bulletText 为空" };
  }
  if (!evidenceIds.length || evidenceIds.length > MAX_EVIDENCE_PER_BULLET) {
    return {
      ok: false,
      reason: `evidenceIds 数量必须在 1-${MAX_EVIDENCE_PER_BULLET} 之间`,
    };
  }
  const candidates = new Map(
    allEvidenceCandidates(snapshot).map((candidate) => [
      candidate.evidenceId,
      candidate,
    ]),
  );
  const isSkillItem = item.id.startsWith("item-skills-");
  const excerpts = [];
  for (const evidenceId of new Set(evidenceIds)) {
    const candidate = candidates.get(evidenceId);
    if (!candidate) {
      return { ok: false, reason: `未知 evidenceId ${evidenceId}` };
    }
    if (!isSkillItem && candidate.experienceId !== item.source_experience_id) {
      return {
        ok: false,
        reason: `evidenceId ${evidenceId} 不属于经历 ${item.source_experience_id}（属于 ${candidate.experienceId}）`,
      };
    }
    // Skills bullets use shared evidence: they may cite sentences already
    // used by experience bullets (soft excerpts, no range reservation), so
    // the exclusivity check against existing bindings is skipped.
    if (!isSkillItem) {
      for (const existing of existingBindings) {
        for (const excerpt of existing.excerpts) {
          if (
            excerpt.experienceId === candidate.experienceId &&
            excerpt.sourceStart < candidate.sourceEnd &&
            candidate.sourceStart < excerpt.sourceEnd
          ) {
            return {
              ok: false,
              reason: `evidenceId ${evidenceId} 与已提交 bullet 的引用区间重叠，不能重复使用`,
            };
          }
        }
      }
    }
    excerpts.push({
      experienceId: candidate.experienceId,
      revisionId: candidate.revisionId,
      revisionContentHash: candidate.revisionContentHash,
      sourceStart: candidate.sourceStart,
      sourceEnd: candidate.sourceEnd,
      sourceQuote: candidate.sourceQuote,
    });
  }
  const quoteText = excerpts.map((excerpt) => excerpt.sourceQuote).join("\n");
  const sourceNumbers = extractEvidenceNumbers(quoteText);
  let missing = extractEvidenceNumbers(text).filter(
    (value) => !sourceNumbers.includes(value),
  );
  // Auto-cover numbers from other candidates of the SAME experience, exactly
  // like the patch path's number coverage: the model's cited slice may not
  // include a number that exists in the same experience's other evidence.
  // This resolves the citation, it does not write content.
  if (missing.length) {
    const covering = coverMissingNumbers(
      candidates,
      isSkillItem ? undefined : item.source_experience_id!,
      excerpts,
      missing,
    );
    if (covering.length) {
      excerpts.push(...covering);
      const covered = extractEvidenceNumbers(
        covering.map((excerpt) => excerpt.sourceQuote).join("\n"),
      );
      missing = missing.filter((value) => !covered.includes(value));
    }
  }
  if (missing.length) {
    return {
      ok: false,
      reason: `bullet 中的数字 ${missing.join(", ")} 在证据原文中不存在；数字必须逐字来自证据。若这些数字来自同一经历的未引用证据，请把包含它们的 evidenceId 一并加入本条引用后重试；否则删除或改为定性描述`,
    };
  }
  if (targetChars) {
    const length = [...text].length;
    if (
      length < targetChars.min * LENGTH_TOLERANCE.min ||
      length > targetChars.max * LENGTH_TOLERANCE.max
    ) {
      return {
        ok: false,
        reason: `长度 ${length} 超出目标 ${targetChars.min}-${targetChars.max}（容差 ±15%）；若实际无法写到该长度，请调低 targetChars 或省略它使用默认区间，尾行达标可在 inspect 后按 shortByChars 补齐`,
      };
    }
  }
  const repeated = findRepeatedFragment(text);
  if (repeated) {
    return { ok: false, reason: `文本包含重复片段 "${repeated}"` };
  }
  // Cross-bullet repetition is judged on the model's own wording only:
  // evidence source quotes are stripped first, otherwise two bullets citing
  // different ranges of the same experience inevitably share long source
  // sentences and every rewrite gets rejected (deadlock).
  const strippedExisting = existingBindings.map((binding) =>
    stripEvidenceQuotes(binding.bulletText, binding.excerpts),
  );
  const strippedNew = stripEvidenceQuotes(
    text,
    excerpts.map((excerpt) => ({
      experienceId: excerpt.experienceId,
      sourceStart: excerpt.sourceStart,
      sourceEnd: excerpt.sourceEnd,
      sourceQuote: excerpt.sourceQuote,
    })),
  );
  // Skills bullets list keywords by design (Python、SQL、Spark…) and may
  // share wording with other bullets, so the cross-bullet repetition gate is
  // skipped for the skills section.
  const crossRepeat = isSkillItem
    ? null
    : findRepeatedFragment(
        [...strippedExisting, strippedNew].join("\n"),
        20,
      );
  if (crossRepeat) {
    return {
      ok: false,
      reason: `非证据措辞与已提交内容存在重复片段 "${crossRepeat}"，请改用不同表述；若该经历证据已用完，请停止填充并进入审查`,
    };
  }
  return {
    ok: true,
    binding: {
      bulletId: bulletId ?? `${item.id}-b${existingBindings.length + 1}`,
      sourceExperienceId: isSkillItem
        ? (item.source_experience_id ?? excerpts[0]!.experienceId)
        : item.source_experience_id!,
      bulletText: text,
      excerpts,
      matchedRequirementIds: [
        ...new Set(
          excerpts.flatMap((excerpt) => candidateRequirements(candidates, excerpt)),
        ),
      ],
      ...(isSkillItem ? { sharedEvidence: true } : {}),
    },
  };
}

function candidateRequirements(
  candidates: Map<string, ReturnType<typeof allEvidenceCandidates>[number]>,
  excerpt: { experienceId: string; sourceStart: number; sourceEnd: number },
): string[] {
  return (
    candidates.get(
      `${excerpt.experienceId}:${excerpt.sourceStart}:${excerpt.sourceEnd}`,
    )?.matchedRequirementIds ?? []
  );
}
