import type { ResumeSourceSnapshot } from "../source-types.js";
import { allEvidenceCandidates } from "../quality/evidence-candidates.js";
import type { AvailableEvidenceCandidate } from "../quality/types.js";
import {
  TARGET_CHARS_PER_LINE_FACTOR,
  type BulletPlan,
  type PlanningParameters,
  type WritingPlan,
} from "./planner.js";
import { buildLayoutContext } from "./layout-context.js";


export interface AiBulletLayout {
  experienceId: string;
  bullets: Array<{
    evidenceIds: string[];
    targetLines?: number;
  }>;
}

export interface LayoutValidationResult {
  ok: boolean;
  errors: string[];
  plan: WritingPlan | null;
}

/**
 * Validates an agent-decided layout against the hard constraints (evidence
 * membership and uniqueness, line budget) and converts it into an executable
 * plan. Errors are precise so the agent can fix its own layout.
 */
export function validateAndPlanLayout(
  snapshot: ResumeSourceSnapshot,
  layout: readonly AiBulletLayout[],
  parameters: PlanningParameters,
  language: "zh-CN" | "en-US",
  maxBulletLines = 3,
): LayoutValidationResult {
  const candidates = new Map(
    allEvidenceCandidates(snapshot).map((candidate) => [
      candidate.evidenceId,
      candidate,
    ]),
  );
  const errors: string[] = [];
  const charsPerLine = Math.max(1, Math.round(parameters.charsPerLine));
  const targetMin = Math.round(charsPerLine * TARGET_CHARS_PER_LINE_FACTOR);
  const context = buildLayoutContext(
    snapshot,
    snapshot.experiences.map((experience) => experience.id),
    parameters,
    language,
    maxBulletLines,
  );
  const budget = context.totalBulletLineBudget;

  const used = new Map<string, { start: number; end: number }>();
  let bulletIndex = 0;
  let totalLines = 0;
  const bullets: import("./planner.js").BulletPlan[] = [];
  const seenExperience = new Set<string>();

  for (const experienceLayout of layout) {
    if (!snapshot.experiences.some((experience) => experience.id === experienceLayout.experienceId)) {
      errors.push(`unknown experienceId ${experienceLayout.experienceId}`);
      continue;
    }
    if (seenExperience.has(experienceLayout.experienceId)) {
      errors.push(`experienceId ${experienceLayout.experienceId} appears twice`);
      continue;
    }
    seenExperience.add(experienceLayout.experienceId);
    for (const bullet of experienceLayout.bullets) {
      const evidenceIds = [...new Set(bullet.evidenceIds)];
      if (!evidenceIds.length) {
        errors.push(`empty bullet for ${experienceLayout.experienceId}`);
        continue;
      }
      const excerpts = evidenceIds.map((evidenceId) => {
        const candidate = candidates.get(evidenceId);
        if (!candidate) {
          errors.push(`unknown evidenceId ${evidenceId}`);
          return null;
        }
        return { candidate, start: candidate.sourceStart, end: candidate.sourceEnd };
      });
      if (excerpts.some((excerpt) => excerpt === null)) continue;
      const own = excerpts.filter((excerpt): excerpt is { candidate: AvailableEvidenceCandidate; start: number; end: number } => excerpt !== null);
      const experienceIds = new Set(own.map((excerpt) => excerpt.candidate.experienceId));
      if (experienceIds.size > 1) {
        errors.push(
          `bullet for ${experienceLayout.experienceId} mixes evidence from ${[
            ...experienceIds,
          ].join(", ")}`,
        );
        continue;
      }
      const overlap = own.find((excerpt) => {
        const key = excerpt.candidate.experienceId;
        const previous = used.get(key);
        return (
          previous !== undefined &&
          previous.start < excerpt.end &&
          excerpt.start < previous.end
        );
      });
      if (overlap) {
        errors.push(
          `evidence ${overlap.candidate.evidenceId} overlaps already assigned evidence of the same experience`,
        );
        continue;
      }
      const targetLines = Math.min(
        maxBulletLines,
        Math.max(1, Math.round(bullet.targetLines ?? 2)),
      );
      totalLines += targetLines;
      for (const excerpt of own) {
        used.set(excerpt.candidate.experienceId, {
          start: excerpt.start,
          end: excerpt.end,
        });
      }
      bullets.push({
        bulletIndex: bulletIndex++,
        itemId: `item-${experienceLayout.experienceId}`,
        experienceId: experienceLayout.experienceId,
        evidenceIds,
        targetChars: {
          min: targetMin,
          max: Math.max(targetMin, Math.round(charsPerLine * targetLines)),
        },
      });
    }
  }
  if (totalLines > budget) {
    errors.push(
      `layout totals ${totalLines} lines, exceeding the ${budget}-line page budget; reduce bullet count or targetLines`,
    );
  }
  if (errors.length) {
    return { ok: false, errors, plan: null };
  }
  const plan: WritingPlan = {
    parameters,
    maxBulletLines,
    totalBulletLines: totalLines,
    bullets,
    reservedEvidenceIds: [],
    evidenceGapChars: 0,
    estimatedMaxUsageRatio: context.estimatedMaxUsageRatio,
    insufficient: context.insufficient,
    additionalCharsNeeded: 0,
  };
  return { ok: true, errors, plan };
}
