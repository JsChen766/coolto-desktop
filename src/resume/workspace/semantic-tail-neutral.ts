import type { MeasuredSemanticTailCandidate } from
  "./semantic-tail-rewrite-measurement.js";
import type { SemanticTailRewriteCandidateInput } from
  "./semantic-tail-rewrite-types.js";
import {
  proposeFactNeutralFragment,
  withFactNeutralFragments,
} from "./fact-neutral-fragments.js";
import type { ResumeWorkspace } from "./types.js";

export function neutralTailValidationWorkspace(
  workspace: ResumeWorkspace,
  bulletId: string,
  revisedText: string,
  candidate: SemanticTailRewriteCandidateInput,
): ResumeWorkspace {
  const neutral = candidate.contentMode === "fact_neutral";
  if (neutral && candidate.additionalEvidenceIds?.length) {
    throw new Error("事实中性改写不得引用新的 additionalEvidenceIds");
  }
  if (neutral && !workspace.factNeutralAuthorization) {
    throw new Error("用户尚未授权事实中性改写");
  }
  if (!neutral && workspace.factNeutralAuthorization) {
    throw new Error("无素材充实阶段的候选必须传 contentMode=fact_neutral");
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
