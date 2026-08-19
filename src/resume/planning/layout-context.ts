import type { ResumeSourceSnapshot } from "../source-types.js";
import { writableEvidenceCandidates } from "../quality/evidence-candidates.js";
import type { ResumeLayoutBudget } from "../workspace/types.js";
import {
  MINIMUM_USAGE_RATIO,
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
  availableEvidenceCount: number;
  maxWritableBulletLines: number;
  availableEvidence: LayoutEvidenceCandidate[];
  evidenceChars: number;
}

export interface LayoutContext {
  jdId: string;
  language: "zh-CN" | "en-US";
  maxBulletLines: 2 | 3;
  /** Bullet lines required to reach the minimum; fixed lines are excluded. */
  requiredBulletLinesAtMinimum: number;
  minimumDistinctBulletsAtMaxLines: number;
  totalBulletLineBudget: number;
  fixedLinesAlreadyExcluded: true;
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
  maxBulletLines: 2 | 3 = 3,
): LayoutContext {
  const candidates = writableEvidenceCandidates(snapshot).filter((candidate) =>
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
  // 物理上限按"每条可写证据至多支撑一条 up-to-maxBulletLines 行的 bullet"
  // 估算，而不是按证据原文长度线性外推：模型把证据扩写成完整事实句是
  // 正常写作（roadmap 明确"3 行 bullet 可达标的样本不得被理论估算误伤"），
  // 因此可写行数上限 = 可写容量 × 单条最大行数。
  const estimatedBulletLines = candidates.length * maxBulletLines;
  const estimatedMaxUsageRatio = Number(
    Math.min(
      0.98,
      ((parameters.fixedLines + estimatedBulletLines) * parameters.lineHeightPx) /
        Math.max(1, parameters.availableHeightPx),
    ).toFixed(4),
  );
  const experiences: LayoutExperienceContext[] = snapshot.experiences
    .filter((experience) => experienceIds.includes(experience.id))
    .map((experience) => {
      const own = candidates.filter(
        (candidate) => candidate.experienceId === experience.id,
      );
      return {
        experienceId: experience.id,
        category: experience.category,
        title: experience.title,
        availableEvidenceCount: own.length,
        maxWritableBulletLines: own.length * maxBulletLines,
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
    requiredBulletLinesAtMinimum: bulletLineBudget,
    minimumDistinctBulletsAtMaxLines: Math.ceil(
      bulletLineBudget / maxBulletLines,
    ),
    totalBulletLineBudget: bulletLineBudget,
    fixedLinesAlreadyExcluded: true,
    charsPerLine,
    fixedLines: parameters.fixedLines,
    estimatedMaxUsageRatio,
    insufficient: estimatedMaxUsageRatio < MINIMUM_USAGE_RATIO,
    experiences,
  };
}

/** 从布局上下文投影出 write_bullet 需要的物理预算（不写死按类别分配）。 */
export function layoutBudgetFromContext(
  context: LayoutContext,
): ResumeLayoutBudget {
  return {
    charsPerLine: context.charsPerLine,
    requiredBulletLinesAtMinimum: context.requiredBulletLinesAtMinimum,
    writableBulletCapacity: context.experiences.reduce(
      (total, experience) => total + experience.availableEvidenceCount,
      0,
    ),
    maxBulletLines: context.maxBulletLines,
  };
}
