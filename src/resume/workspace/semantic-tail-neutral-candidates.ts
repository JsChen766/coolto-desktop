import { factNeutralClosureActive } from "./first-generation-policy.js";
import { factNeutralRewriteOptionPool } from
  "./fact-neutral-rewrite-options.js";
import type { TailLengthBudget } from "./tail-length-budget.js";
import type {
  SemanticTailRewriteInput,
} from "./semantic-tail-rewrite-types.js";
import type { ResumeWorkspace } from "./types.js";
import { factEquivalentTailOptions } from "./fact-equivalent-tail.js";

interface NeutralTarget {
  currentText: string;
  lengthBudget?: TailLengthBudget;
}

/** Tests the complete finite neutral pool after the user ends supplementation. */
export function expandFactNeutralTailCandidates(
  workspace: ResumeWorkspace,
  inputs: readonly SemanticTailRewriteInput[],
  targets: ReadonlyMap<string, NeutralTarget>,
): SemanticTailRewriteInput[] {
  if (!factNeutralClosureActive(workspace)) {
    return inputs.map(cloneInput);
  }
  return inputs.map((input, inputIndex) => {
    const target = targets.get(input.bulletId);
    if (!target) return cloneInput(input);
    const pool = factNeutralRewriteOptionPool({
      bulletId: input.bulletId,
      currentText: target.currentText,
      language: workspace.structure.language,
      ...(target.lengthBudget ? { budget: target.lengthBudget } : {}),
    }).slice(0, 4);
    const offset = pool.length ? inputIndex % pool.length : 0;
    const generated = [...pool.slice(offset), ...pool.slice(0, offset)].map(
      (revisedText) => ({
        strategy: "expand" as const,
        revisedText,
        contentMode: "fact_neutral" as const,
      }),
    );
    const equivalent = factEquivalentTailOptions(target.currentText).map(
      (revisedText) => ({
        strategy: "expand" as const,
        revisedText,
        contentMode: "fact_equivalent" as const,
      }),
    );
    const submitted = input.candidates.map((candidate) => ({ ...candidate }));
    const candidates = [...submitted, ...generated, ...equivalent].filter(
      (candidate, index, values) => values.findIndex((entry) =>
        entry.revisedText.trim() === candidate.revisedText.trim()
      ) === index,
    );
    return { bulletId: input.bulletId, candidates };
  });
}

export function semanticCandidateTextMaps(
  inputs: readonly SemanticTailRewriteInput[],
): Array<Map<string, string>> {
  const maximum = Math.max(0, ...inputs.map((input) => input.candidates.length));
  return Array.from({ length: maximum }, (_, candidateIndex) =>
    new Map(inputs.flatMap((input) => {
      const text = input.candidates[candidateIndex]?.revisedText.trim();
      return text ? [[input.bulletId, text] as const] : [];
    }))
  );
}

function cloneInput(input: SemanticTailRewriteInput): SemanticTailRewriteInput {
  return {
    bulletId: input.bulletId,
    candidates: input.candidates.map((candidate) => ({ ...candidate })),
  };
}
