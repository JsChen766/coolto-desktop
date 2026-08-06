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
  const skillEvidence = collectSkillEvidence(selected);
  if (!skillEvidence.length) return plan;
  const candidates = allEvidenceCandidates(snapshot);
  const charsPerLine = Math.max(1, Math.round(typography.charsPerLine));
  const target = {
    min: Math.round(charsPerLine * 1.0),
    max: Math.round(charsPerLine * 1.3),
  };
  const skills = [...new Set(skillEvidence.map((entry) => entry.skill))];
  const cited = candidates
    .filter((candidate) =>
      skills.some((skill) =>
        candidate.sourceQuote.toLocaleLowerCase().includes(skill.toLocaleLowerCase()),
      ),
    )
    .slice(0, 3);
  if (!cited.length) return plan;
  const bullets = [
    ...plan.bullets,
    {
      bulletIndex: plan.bullets.length,
      itemId: "item-skills-synthetic",
      experienceId: skillEvidence[0]!.experienceId,
      evidenceIds: cited.map((candidate) => candidate.evidenceId),
      targetChars: target,
    },
  ];
  const addedLines = 1;
  void addedLines;
  if (!cited.length) return plan;
  return {
    ...plan,
    bullets,
    totalBulletLines: plan.totalBulletLines + 1,
  };
}
