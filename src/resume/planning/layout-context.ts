import type { ResumeSourceSnapshot } from "../source-types.js";
import { allEvidenceCandidates } from "../quality/evidence-candidates.js";
import { plannedBulletsFor } from "../source-projection.js";
import {
  MINIMUM_USAGE_RATIO,
  EXPANSION_FACTOR_ZH,
  EXPANSION_FACTOR_EN,
  TARGET_CHARS_PER_LINE_FACTOR,
  type PlanningParameters,
} from "./planner.js";

export interface LayoutEvidenceCandidate {
  evidenceId: string;
  sourceQuote: string;
  chars: number;
  matchedRequirementIds: readonly string[];
}

export interface LayoutExperienceContext {
  experienceId: string;
  category: string;
  title: string;
  suggestedBulletCount: number;
  availableEvidence: LayoutEvidenceCandidate[];
  evidenceChars: number;
}

export interface LayoutContext {
  jdId: string;
  language: "zh-CN" | "en-US";
  maxBulletLines: number;
  totalBulletLineBudget: number;
  charsPerLine: number;
  fixedLines: number;
  /** Physical usage ceiling of the selected material (0-1). */
  estimatedMaxUsageRatio: number;
  insufficient: boolean;
  experiences: LayoutExperienceContext[];
}

/**
 * Read-only planning context handed to the agent: hard budget numbers and
 * per-experience evidence candidates. The agent decides the layout itself
 * (bullet counts, evidence assignment, emphasis); this module makes no
 * layout decisions.
 */
export function buildLayoutContext(
  snapshot: ResumeSourceSnapshot,
  experienceIds: readonly string[],
  parameters: PlanningParameters,
  language: "zh-CN" | "en-US",
  maxBulletLines = 3,
): LayoutContext {
  const candidates = allEvidenceCandidates(snapshot).filter((candidate) =>
    experienceIds.includes(candidate.experienceId),
  );
  const bulletLineBudget = Math.max(
    1,
    Math.floor(
      (parameters.availableHeightPx * MINIMUM_USAGE_RATIO) /
        Math.max(1, parameters.lineHeightPx),
    ) - parameters.fixedLines,
  );
  const charsPerLine = Math.max(1, Math.round(parameters.charsPerLine));
  const availableChars = candidates.reduce(
    (total, candidate) => total + [...candidate.sourceQuote].length,
    0,
  );
  const expansion = language === "en-US" ? EXPANSION_FACTOR_EN : EXPANSION_FACTOR_ZH;
  const requiredChars = bulletLineBudget * charsPerLine;
  const estimatedMaxUsageRatio = Number(
    Math.min(0.98, (availableChars * expansion) / Math.max(1, requiredChars)).toFixed(4),
  );
  const experiences: LayoutExperienceContext[] = snapshot.experiences
    .filter((experience) => experienceIds.includes(experience.id))
    .map((experience) => {
      const own = candidates.filter(
        (candidate) => candidate.experienceId === experience.id,
      );
      const perBulletChars = Math.round(
        charsPerLine * TARGET_CHARS_PER_LINE_FACTOR,
      );
      return {
        experienceId: experience.id,
        category: experience.category,
        title: experience.title,
        suggestedBulletCount: Math.min(
          plannedBulletsFor(experience.category),
          Math.max(
            1,
            Math.floor(
              own.reduce((total, candidate) => total + [...candidate.sourceQuote].length, 0) /
                Math.max(1, perBulletChars),
            ),
          ),
        ),
        availableEvidence: own.map((candidate) => ({
          evidenceId: candidate.evidenceId,
          sourceQuote: candidate.sourceQuote,
          chars: [...candidate.sourceQuote].length,
          matchedRequirementIds: candidate.matchedRequirementIds,
        })),
        evidenceChars: own.reduce(
          (total, candidate) => total + [...candidate.sourceQuote].length,
          0,
        ),
      };
    });
  return {
    jdId: snapshot.jd.id,
    language,
    maxBulletLines,
    totalBulletLineBudget: bulletLineBudget,
    charsPerLine,
    fixedLines: parameters.fixedLines,
    estimatedMaxUsageRatio,
    insufficient: estimatedMaxUsageRatio < MINIMUM_USAGE_RATIO,
    experiences,
  };
}
