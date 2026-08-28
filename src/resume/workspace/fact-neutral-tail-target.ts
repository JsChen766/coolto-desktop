import { factNeutralPhraseOptions } from "./fact-neutral-phrases.js";
import type { TailLengthBudget } from "./tail-length-budget.js";
import type { ResumeWorkspace } from "./types.js";
import { factNeutralClosureActive } from "./first-generation-policy.js";

export function factNeutralTailTargetFields(
  workspace: ResumeWorkspace,
  budget: TailLengthBudget | undefined,
  mode: "growth" | "reflow",
  groundedRequiredEdit: string,
) {
  if (!factNeutralClosureActive(workspace)) {
    return { requiredEdit: groundedRequiredEdit };
  }
  return {
    requiredEdit: mode === "growth"
      ? "从 allowedNeutralPhrases 逐字选择一条作为 growthText；传 contentMode=fact_neutral"
      : "currentText 后只追加 allowedNeutralPhrases 中的一条；传 contentMode=fact_neutral",
    contentMode: "fact_neutral" as const,
    allowedNeutralPhrases: factNeutralPhraseOptions(
      workspace.structure.language,
      budget,
    ).map((option) => option.text),
  };
}
