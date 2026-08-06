import type {
  BulletEvidenceBinding,
  ResumeSourceSnapshot,
} from "../source-types.js";
import { allEvidenceCandidates } from "../quality/evidence-candidates.js";

export interface PlanningParameters {
  charsPerLine: number;
  lineHeightPx: number;
  availableHeightPx: number;
  /** Reserved vertical space for header, section headings and item titles. */
  fixedLines: number;
}

export interface BulletPlan {
  bulletIndex: number;
  itemId: string;
  experienceId: string;
  evidenceIds: string[];
  /** Deterministic text length target so a bullet lands at 1.7-2.0 lines. */
  targetChars: { min: number; max: number };
}

export interface WritingPlan {
  parameters: PlanningParameters;
  maxBulletLines: number;
  totalBulletLines: number;
  bullets: BulletPlan[];
  /** Unassigned evidence kept as slack for mechanical repairs. */
  reservedEvidenceIds: string[];
  /** Shortfall of available source chars vs the planned target chars. */
  evidenceGapChars: number;
  /** Estimated maximum usage ratio the available evidence can physically reach. */
  estimatedMaxUsageRatio: number;
  /** True when the material cannot physically reach the 85% page gate. */
  insufficient: boolean;
  /** How many source chars a user would need to add to reach the gate. */
  additionalCharsNeeded: number;
}

/**
 * Budget-first resume plan. The page target (85%) is converted into a line
 * budget; lines are allocated to experiences weighted by JD relevance, then
 * each bullet packs consecutive source sentences until the packed length
 * reaches the target chars for the configured bullet height (3 lines by
 * default; 2-line mode can be restored via maxBulletLines=2).
 *
 * When the material cannot physically reach the gate, the plan reports the
 * shortfall (`insufficient` + `additionalCharsNeeded`) so the generation can
 * ask the user to add experiences instead of silently running.
 */


/** Deterministic description of a plan for logging and comparison. */
export function summarizePlan(plan: WritingPlan): object {
  return {
    bulletCount: plan.bullets.length,
    totalBulletLines: plan.totalBulletLines,
    reservedEvidenceCount: plan.reservedEvidenceIds.length,
    maxBulletLines: plan.maxBulletLines,
    insufficient: plan.insufficient,
    estimatedMaxUsageRatio: plan.estimatedMaxUsageRatio,
    additionalCharsNeeded: plan.additionalCharsNeeded,
    perBullet: plan.bullets.map((bullet) => ({
      itemId: bullet.itemId,
      evidenceCount: bullet.evidenceIds.length,
      targetChars: bullet.targetChars,
    })),
  };
}

export function bindingsFromPlan(
  snapshot: ResumeSourceSnapshot,
  plan: WritingPlan,
): BulletEvidenceBinding[] {
  const candidates = new Map(
    allEvidenceCandidates(snapshot).map((candidate) => [
      candidate.evidenceId,
      candidate,
    ]),
  );
  return plan.bullets.map((bullet, index) => {
    const excerpts = bullet.evidenceIds.map((evidenceId) => {
      const candidate = candidates.get(evidenceId);
      if (!candidate) throw new Error(`Plan references unknown evidence ${evidenceId}`);
      return {
        experienceId: candidate.experienceId,
        revisionId: candidate.revisionId,
        revisionContentHash: candidate.revisionContentHash,
        sourceStart: candidate.sourceStart,
        sourceEnd: candidate.sourceEnd,
        sourceQuote: candidate.sourceQuote,
      };
    });
    return {
      bulletId: `bl-${index}`,
      sourceExperienceId: bullet.experienceId,
      bulletText: "",
      excerpts,
      matchedRequirementIds: [
        ...new Set(
          excerpts.flatMap(
            (excerpt) =>
              candidates.get(
                `${excerpt.experienceId}:${excerpt.sourceStart}:${excerpt.sourceEnd}`,
              )?.matchedRequirementIds ?? [],
          ),
        ),
      ],
    };
  });
}
