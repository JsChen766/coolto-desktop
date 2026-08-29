import type { ResumeWorkspace } from "./types.js";

export interface ResumeReuseAdaptationAction {
  mode: "adapt_reused_content";
  requiredInput: "items";
  itemIds: string[];
  itemTargets: Array<{
    itemId: string;
    currentBullets: Array<{
      bulletId: string;
      text: string;
      evidenceIds: string[];
      requirementIds: string[];
    }>;
    requiredEdit: string;
  }>;
  uncoveredRequirements: Array<{
    id: string;
    text: string;
    importance: string;
    keywords: string[];
  }>;
}

export function reuseAdaptationNextAction(
  workspace: ResumeWorkspace,
): ResumeReuseAdaptationAction | undefined {
  const adaptation = workspace.reuseAdaptation;
  if (!adaptation || adaptation.status !== "pending") return undefined;
  const provenance = new Map((workspace.bulletProvenance ?? []).map(
    (entry) => [entry.bulletId, entry],
  ));
  const itemIds = adaptation.targetItemIds.length
    ? adaptation.targetItemIds : firstWritableItemIds(workspace);
  return {
    mode: "adapt_reused_content",
    requiredInput: "items",
    itemIds,
    itemTargets: itemIds.flatMap((itemId) => {
      const item = workspace.structure.sections.flatMap((section) =>
        section.items.filter((candidate) => candidate.id === itemId)
      )[0];
      return item ? [{
        itemId,
        currentBullets: item.bullets.map((bullet) => ({
          bulletId: bullet.id,
          text: bullet.text,
          evidenceIds: [...(provenance.get(bullet.id)?.evidenceIds ?? [])],
          requirementIds: [...(provenance.get(bullet.id)?.requirementIds ?? [])],
        })),
        requiredEdit:
          "保留仍适合新 JD 的优秀内容，只对岗位重点、表达顺序或证据选择做最小必要调整；一次提交该 item 的完整 bullet 列表",
      }] : [];
    }),
    uncoveredRequirements: (workspace.sourceSnapshot.jd?.requirements ?? [])
      .filter((requirement) =>
        adaptation.uncoveredRequirementIds.includes(requirement.id)
      )
      .map((requirement) => ({
        id: requirement.id,
        text: requirement.text,
        importance: requirement.v2Importance ?? requirement.importance,
        keywords: [...requirement.keywords],
      })),
  };
}

function firstWritableItemIds(workspace: ResumeWorkspace): string[] {
  return workspace.structure.sections.flatMap((section) =>
    ["education", "skills"].includes(section.type) ? [] : section.items
  ).slice(0, 1).map((item) => item.id);
}
