import {
  proposeFactNeutralFragment,
  withFactNeutralFragments,
} from "./fact-neutral-fragments.js";
import type { ResumeWorkspace } from "./types.js";
import { factNeutralClosureActive } from "./first-generation-policy.js";

export function validateFactNeutralTailEdit(
  workspace: ResumeWorkspace,
  input: {
    bulletId: string;
    appliedText: string;
    contentMode?: "fact_neutral";
  },
): ResumeWorkspace {
  if (input.contentMode === "fact_neutral") {
    const proposal = proposeFactNeutralFragment({
      workspace,
      bulletId: input.bulletId,
      appliedText: input.appliedText,
      purpose: "tail_fill",
    });
    return withFactNeutralFragments(workspace, [proposal]);
  }
  if (factNeutralClosureActive(workspace)) {
    throw new Error(
      `bullet ${input.bulletId} 已进入无素材补齐阶段，必须显式传 contentMode=fact_neutral`,
    );
  }
  return workspace;
}
