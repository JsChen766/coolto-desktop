import type { ResumeSourceSnapshot } from "../source-types.js";
import { allEvidenceCandidates } from "../quality/evidence-candidates.js";
import { plannedBulletsFor } from "../source-projection.js";
import type { BulletPlan, PlanningParameters, WritingPlan } from "./bullet-plan.js";

export const MIN_TAIL_RATIO = 0.6671;
export const MINIMUM_USAGE_RATIO = 0.85;
export const TARGET_CHARS_PER_LINE_FACTOR = 1.68;
export const MAX_EVIDENCE_PER_BULLET = 3;
/**
 * Bullets are written from evidence facts, not copies of evidence text. The
 * expansion factor is the observed ceiling of model paraphrase per language:
 * Chinese sentences are already condensed (~2.4x, validated on zh-ai 86% and
 * zh-analytics 64% observed usage). English sentences carry much more
 * structural room: en-data reached 96% usage, which is ~5.4x expansion of its
 * 762 source chars, so the factor is set from that observed ceiling.
 */
export const EXPANSION_FACTOR_ZH = 2.4;
export const EXPANSION_FACTOR_EN = 5.4;

export function planResumeWriting(
  snapshot: ResumeSourceSnapshot,
  experienceIds: readonly string[],
  parameters: PlanningParameters,
  language: "zh-CN" | "en-US",
  maxBulletLines = 3,
): WritingPlan {
  const candidates = allEvidenceCandidates(snapshot);
  const byExperience = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    if (!experienceIds.includes(candidate.experienceId)) continue;
    const list = byExperience.get(candidate.experienceId) ?? [];
    list.push(candidate);
    byExperience.set(candidate.experienceId, list);
  }
  const experiences = snapshot.experiences.filter((experience) =>
    experienceIds.includes(experience.id),
  );
  const relevance = experienceRelevance(snapshot, experiences);

  const bulletLineBudget = Math.max(
    1,
    Math.floor(
      (parameters.availableHeightPx * MINIMUM_USAGE_RATIO) /
        Math.max(1, parameters.lineHeightPx),
    ) - parameters.fixedLines,
  );
  const weights = experiences.map((experience) => relevance.get(experience.id) ?? 1);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const charsPerLine = Math.max(1, Math.round(parameters.charsPerLine));
  const targetMin = Math.round(charsPerLine * TARGET_CHARS_PER_LINE_FACTOR);
  const targetMax = Math.round(charsPerLine * maxBulletLines);

  const bullets: BulletPlan[] = [];
  let bulletIndex = 0;
  let assignedLines = 0;
  for (let index = 0; index < experiences.length; index += 1) {
    const experience = experiences[index]!;
    const experienceLines =
      index === experiences.length - 1
        ? bulletLineBudget - assignedLines
        : Math.max(
            2,
            Math.round((bulletLineBudget * weights[index]!) / totalWeight),
          );
    assignedLines += experienceLines;
    const planned = plannedBulletsFor(experience.category);
    const maxBulletsByLines = Math.max(
      1,
      Math.floor(experienceLines / (maxBulletLines - 0.15)),
    );
    const maxBulletsByEvidence = Math.max(
      1,
      Math.floor(
        [...(byExperience.get(experience.id) ?? [])].reduce(
          (total, candidate) => total + [...candidate.sourceQuote].length,
          0,
        ) /
          Math.max(1, targetMin),
      ),
    );
    const bulletCount = Math.min(planned, maxBulletsByLines, maxBulletsByEvidence);
    const perBulletLines = experienceLines / Math.max(1, bulletCount);
    const sentencePool = [...(byExperience.get(experience.id) ?? [])];

    for (let bullet = 0; bullet < bulletCount && sentencePool.length; bullet += 1) {
      const packed = packSentences(
        sentencePool,
        targetMin,
        Math.min(targetMax, Math.round(charsPerLine * perBulletLines)),
        bullet === bulletCount - 1,
      );
      if (!packed.length) break;
      bullets.push({
        bulletIndex: bulletIndex++,
        itemId: `item-${experience.id}`,
        experienceId: experience.id,
        evidenceIds: packed.map((candidate) => candidate.evidenceId),
        targetChars: { min: targetMin, max: targetMax },
      });
      removeAssigned(sentencePool, packed);
    }
  }
  const reservedEvidenceIds = [...byExperience.values()]
    .flat()
    .filter(
      (candidate) =>
        !bullets.some((bullet) => bullet.evidenceIds.includes(candidate.evidenceId)),
    )
    .map((candidate) => candidate.evidenceId);
  const availableChars = [...byExperience.values()]
    .flat()
    .reduce((total, candidate) => total + [...candidate.sourceQuote].length, 0);
  const expansion = expansionFactor(language);
  const requiredChars = bulletLineBudget * charsPerLine;
  const estimatedMaxUsageRatio = Number(
    Math.min(0.98, (availableChars * expansion) / Math.max(1, requiredChars)).toFixed(4),
  );
  const additionalCharsNeeded = Math.max(
    0,
    Math.ceil(
      (requiredChars * MINIMUM_USAGE_RATIO - availableChars * expansion) /
        expansion,
    ),
  );
  return {
    parameters,
    maxBulletLines,
    totalBulletLines: assignedLines,
    bullets,
    reservedEvidenceIds,
    evidenceGapChars: Math.max(0, requiredChars - availableChars * expansion),
    estimatedMaxUsageRatio,
    insufficient: estimatedMaxUsageRatio < MINIMUM_USAGE_RATIO,
    additionalCharsNeeded,
  };
}

function packSentences(
  pool: ReturnType<typeof allEvidenceCandidates>,
  targetMin: number,
  targetMax: number,
  isLast: boolean,
): ReturnType<typeof allEvidenceCandidates> {
  const packed: ReturnType<typeof allEvidenceCandidates> = [];
  let length = 0;
  for (const candidate of pool) {
    const candidateLength = [...candidate.sourceQuote].length;
    if (packed.length === 0 && candidateLength > targetMax && !isLast) {
      continue;
    }
    if (
      packed.length >= MAX_EVIDENCE_PER_BULLET &&
      length >= targetMin * 0.8
    ) {
      break;
    }
    if (packed.length > 0 && length + candidateLength > targetMax * 1.15) {
      break;
    }
    packed.push(candidate);
    length += candidateLength;
    if (length >= targetMin) break;
  }
  if (!packed.length) {
    const fallback = pool.find(
      (candidate) => [...candidate.sourceQuote].length > 0,
    );
    if (fallback) packed.push(fallback);
  }
  return packed;
}

function removeAssigned(
  pool: ReturnType<typeof allEvidenceCandidates>,
  assigned: ReturnType<typeof allEvidenceCandidates>,
): void {
  const assignedIds = new Set(assigned.map((candidate) => candidate.evidenceId));
  for (let index = pool.length - 1; index >= 0; index -= 1) {
    if (assignedIds.has(pool[index]!.evidenceId)) pool.splice(index, 1);
  }
}

function experienceRelevance(
  snapshot: ResumeSourceSnapshot,
  experiences: readonly (ResumeSourceSnapshot["experiences"][number])[],
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const experience of experiences) {
    const text = `${experience.content} ${experience.tags.join(" ")}`.toLocaleLowerCase();
    let score = 0;
    for (const requirement of snapshot.jd.requirements) {
      const terms =
        requirement.keywords.length > 0
          ? requirement.keywords
          : requirement.text
              .split(/[^\p{L}\p{N}+#.]+/u)
              .filter((term) => term.length >= 2);
      if (terms.some((term) => text.includes(term.toLocaleLowerCase()))) {
        score += requirement.importance === "high" ? 2 : 1;
      }
    }
    scores.set(experience.id, Math.max(1, score));
  }
  return scores;
}

function expansionFactor(language: "zh-CN" | "en-US"): number {
  return language === "en-US" ? EXPANSION_FACTOR_EN : EXPANSION_FACTOR_ZH;
}

// Re-exported for callers; implementations live in bullet-plan.ts.
export {
  bindingsFromPlan,
  summarizePlan,
  type BulletPlan,
  type PlanningParameters,
  type WritingPlan,
} from "./bullet-plan.js";
