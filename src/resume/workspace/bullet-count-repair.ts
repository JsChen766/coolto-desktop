import {
  isStandaloneScalarEvidence,
  writableEvidenceCandidates,
} from "../quality/evidence-candidates.js";
import type { ResumeItemTier, ResumeWorkspace } from "./types.js";
import { minimumResumeBulletCount } from "./bullet-count-rules.js";

export interface BulletCountRepairEvidence {
  evidenceId: string;
  text: string;
}

export interface BulletCountRepairTarget {
  itemId: string;
  sourceExperienceId: string;
  tier: ResumeItemTier | "skills";
  currentBulletCount: number;
  minimumBulletCount: number;
  missingBulletCount: number;
  currentBullets: Array<{
    bulletId: string;
    text: string;
    evidenceIds: string[];
  }>;
  availableEvidence: BulletCountRepairEvidence[];
  requiredEdit: string;
}

export type BulletCountRepairPlan =
  | { mode: "repair"; targets: BulletCountRepairTarget[] }
  | {
    mode: "request_more_material";
    targetExperienceId: string;
    question: string;
  };

export function bulletCountRepairPlan(
  workspace: ResumeWorkspace,
): BulletCountRepairPlan {
  const provenance = new Map(
    (workspace.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  const sourceEvidence = writableEvidenceCandidates(workspace.sourceSnapshot);
  const targets: BulletCountRepairTarget[] = [];
  for (const section of workspace.structure.sections) {
    for (const item of section.items) {
      const tier = workspace.itemTiers?.[item.id];
      const minimum = minimumResumeBulletCount({
        sectionType: section.type,
        itemId: item.id,
        ...(tier ? { tier } : {}),
      });
      if (!minimum) continue;
      if (item.bullets.length >= minimum) continue;
      const targetTier = tier ?? "skills";
      const experienceId = item.source_experience_id ?? "";
      const availableEvidence = distinctEvidence([
        ...sourceEvidence
          .filter((entry) => entry.experienceId === experienceId)
          .map((entry) => ({
            evidenceId: entry.evidenceId,
            text: entry.sourceQuote,
          })),
        ...(workspace.supplementalEvidence ?? [])
          .filter((entry) =>
            entry.experienceId === experienceId &&
            !isStandaloneScalarEvidence(entry.text)
          )
          .map((entry) => ({
            evidenceId: entry.evidenceId,
            text: entry.text,
          })),
      ]);
      if (availableEvidence.length < minimum) {
        const missingFacts = minimum - availableEvidence.length;
        return {
          mode: "request_more_material",
          targetExperienceId: experienceId,
          question: `经历「${item.organization || item.title || experienceId}」目前只有 ${availableEvidence.length} 条可独占事实，${targetTier} 内容至少需要 ${minimum} 条 bullet。请再补充至少 ${missingFacts} 条不同的真实事实，优先说明具体任务、方法、协作对象、规模或结果。`,
        };
      }
      const currentBullets = item.bullets.map((bullet) => ({
        bulletId: bullet.id,
        text: bullet.text,
        evidenceIds: [...(provenance.get(bullet.id)?.evidenceIds ?? [])],
      }));
      targets.push({
        itemId: item.id,
        sourceExperienceId: experienceId,
        tier: targetTier,
        currentBulletCount: item.bullets.length,
        minimumBulletCount: minimum,
        missingBulletCount: minimum - item.bullets.length,
        currentBullets,
        availableEvidence,
        requiredEdit: `一次提交该 item 的完整 ${minimum} 条或更多 bullet；保留可用 currentBullets，并从 availableEvidence 中为每条 grounded bullet 引用不同的 evidenceId，不得输出候选版本`,
      });
    }
  }
  return { mode: "repair", targets };
}

function distinctEvidence(
  evidence: BulletCountRepairEvidence[],
): BulletCountRepairEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((entry) => {
    if (seen.has(entry.evidenceId)) return false;
    seen.add(entry.evidenceId);
    return true;
  });
}
