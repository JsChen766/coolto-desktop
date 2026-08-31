import type { TailLengthBudget } from "./tail-length-budget.js";

const ZH_PHRASES = [
  "便于后续复核",
  "便于后续统一复核",
  "便于保持工作脉络清晰并支持后续复核",
  "便于结构化归纳并保持后续复核方式一致",
  "以便保持工作脉络清晰且便于后续统一复核",
  "便于后续持续跟踪并保持整体工作脉络与复核方式一致",
  "以便保持整体工作脉络清晰且便于后续按一致方式持续跟踪与复核",
  "便于后续持续跟踪与统一复核并保持整体工作脉络和信息呈现方式一致",
  "为便于后续持续跟踪与统一复核并保持整体工作脉络和信息呈现方式前后一致",
  "便于后续按照一致方式持续跟踪与统一复核并保持整体工作脉络和信息呈现方式清晰且前后一致",
] as const;

const EN_PHRASES = [
  "for future review",
  "for consistent future review",
  "for structured review and consistent follow-through",
  "to keep the workflow clear for ongoing review",
  "for ongoing tracking and consistent future review across the workflow",
] as const;

export interface FactNeutralPhraseOption {
  text: string;
  cjkVisualUnits: number;
}

export function factNeutralPhraseOptions(
  language: string,
  budget?: TailLengthBudget,
): FactNeutralPhraseOption[] {
  const phrases = language === "zh-CN" ? ZH_PHRASES : EN_PHRASES;
  const options = phrases.map((text) => ({
    text,
    cjkVisualUnits: visualUnits(text),
  }));
  if (!budget) return options;
  const inBudget = options.filter((option) =>
    option.cjkVisualUnits >= budget.minimumGrowthCjk &&
    option.cjkVisualUnits <= budget.maximumGrowthCjk
  );
  return inBudget.length ? inBudget : closest(options, budget.idealGrowthCjk);
}

export function isApprovedFactNeutralPhrase(value: string): boolean {
  return [...ZH_PHRASES, ...EN_PHRASES].includes(value.trim() as never);
}

function visualUnits(value: string): number {
  return [...value].reduce((total, character) =>
    total + (/\p{Script=Han}/u.test(character) ? 1 : /\s/u.test(character) ? 0.25 : 0.5), 0
  );
}

function closest(
  options: FactNeutralPhraseOption[],
  target: number,
): FactNeutralPhraseOption[] {
  return [...options].sort((left, right) =>
    Math.abs(left.cjkVisualUnits - target) -
    Math.abs(right.cjkVisualUnits - target)
  ).slice(0, 3);
}
