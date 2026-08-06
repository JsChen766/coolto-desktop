import { allEvidenceCandidates } from "../quality/evidence-candidates.js";
import { collectSkillEvidence } from "../workspace/section-registry.js";
import type { ResumeSourceSnapshot } from "../source-types.js";
import type { PlanningParameters, WritingPlan } from "./planner.js";

/**
 * Appends one evidence-bound skill bullet per experience group to the plan.
 * Skill words come from tags that actually appear in the experience content;
 * the bullet cites the sentences that contain them, so the EvidenceLedger and
 * claim checks pass by construction.
 */
export function appendSkillBullets(
  plan: WritingPlan,
  snapshot: ResumeSourceSnapshot,
  experienceIds: readonly string[],
  typography: PlanningParameters,
): WritingPlan {
  const selected = snapshot.experiences.filter((experience) =>
    experienceIds.includes(experience.id),
  );
  const skillsByExperience = new Map<string, string[]>();
  for (const { skill, experienceId } of collectSkillEvidence(selected)) {
    const list = skillsByExperience.get(experienceId) ?? [];
    list.push(skill);
    skillsByExperience.set(experienceId, list);
  }
  if (!skillsByExperience.size) return plan;
  const candidates = allEvidenceCandidates(snapshot);
  const charsPerLine = Math.max(1, Math.round(typography.charsPerLine));
  const target = {
    min: Math.round(charsPerLine * 1.0),
    max: Math.round(charsPerLine * 1.3),
  };
  const bullets = [...plan.bullets];
  let nextIndex = plan.bullets.length;
  let addedLines = 0;
  for (const [experienceId, skills] of skillsByExperience) {
    const cited = candidates
      .filter(
        (candidate) =>
          candidate.experienceId === experienceId &&
          skills.some((skill) =>
            candidate.sourceQuote.toLocaleLowerCase().includes(skill.toLocaleLowerCase()),
          ),
      )
      .slice(0, 2);
    if (!cited.length) continue;
    bullets.push({
      bulletIndex: nextIndex++,
      itemId: `item-skills-${experienceId}`,
      experienceId,
      evidenceIds: cited.map((candidate) => candidate.evidenceId),
      targetChars: target,
    });
    addedLines += 1;
  }
  if (!addedLines) return plan;
  return {
    ...plan,
    bullets,
    totalBulletLines: plan.totalBulletLines + addedLines,
  };
}
