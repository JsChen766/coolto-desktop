import type { MeasuredSemanticTailCandidate } from
  "./semantic-tail-rewrite-measurement.js";
import type { SemanticTailRewriteCandidateInput } from
  "./semantic-tail-rewrite-types.js";
import {
  proposeFactNeutralFragment,
  withFactNeutralFragments,
} from "./fact-neutral-fragments.js";
import type { ResumeWorkspace } from "./types.js";
import { factNeutralClosureActive } from "./first-generation-policy.js";
import { validateFactEquivalentTailEdit } from "./fact-equivalent-tail.js";

export function neutralTailValidationWorkspace(
  workspace: ResumeWorkspace,
  bulletId: string,
  revisedText: string,
  candidate: SemanticTailRewriteCandidateInput,
): ResumeWorkspace {
  const neutral = candidate.contentMode === "fact_neutral";
  const equivalent = candidate.contentMode === "fact_equivalent";
  if ((neutral || equivalent) && candidate.additionalEvidenceIds?.length) {
    throw new Error("事实中性改写不得引用新的 additionalEvidenceIds");
  }
  const neutralActive = factNeutralClosureActive(workspace);
  if (neutral && !neutralActive) {
    throw new Error("用户尚未授权事实中性改写");
  }
  if (equivalent && !neutralActive) {
    throw new Error("用户尚未授权事实等价重排");
  }
  if (!neutral && !equivalent && neutralActive) {
    throw new Error("无素材充实阶段的候选必须传 contentMode=fact_neutral");
  }
  if (equivalent) {
    const currentText = workspace.structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets)
    ).find((bullet) => bullet.id === bulletId)?.text;
    if (!currentText) throw new Error(`bullet ${bulletId} 不在当前工作区`);
    validateFactEquivalentTailEdit(currentText, revisedText);
    return withFactNeutralFragments(workspace, [proposeFactNeutralFragment({
      workspace,
      bulletId,
      appliedText: revisedText,
      purpose: "tail_fill",
    })]);
  }
  if (!neutral) return workspace;
  return withFactNeutralFragments(workspace, [proposeFactNeutralFragment({
    workspace,
    bulletId,
    appliedText: revisedText,
    purpose: "tail_fill",
  })]);
}

export function selectedNeutralTailFragments(
  workspace: ResumeWorkspace,
  selected: readonly MeasuredSemanticTailCandidate[],
) {
  return selected.flatMap((candidate) =>
    candidate.contentMode === "fact_neutral"
      ? [proposeFactNeutralFragment({
          workspace,
          bulletId: candidate.bulletId,
          appliedText: candidate.revisedText,
          purpose: "tail_fill",
        })]
      : []
  );
}
