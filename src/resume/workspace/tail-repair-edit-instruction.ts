import type {
  TailRepairEditInstruction,
  TailRepairTarget,
} from "./tail-repair-targets.js";

export function withEditInstruction(
  target: TailRepairTarget,
  requestedLineDelta?: -1 | 1,
): TailRepairTarget {
  const currentCharacters = [...target.currentText].length;
  const guidance = target.retryGuidance;
  if (guidance?.mode === "page_capacity" && requestedLineDelta === undefined) {
    return { ...target, editInstruction: instruction("hold", 0, 0) };
  }
  if (requestedLineDelta === -1 && target.compactTotalCharacterTargets) {
    return { ...target, editInstruction: instruction(
      "compact",
      Math.max(1, currentCharacters -
        target.compactTotalCharacterTargets.maximum),
      Math.max(1, currentCharacters -
        target.compactTotalCharacterTargets.minimum),
    ) };
  }
  const expansion = requestedLineDelta === 1
    ? target.addOneLineModifierCharacterTargets
    : guidance?.additionalCharacterTargets ??
      target.groundedModifierCharacterTargets;
  return { ...target, editInstruction: instruction(
    "expand",
    expansion?.minimum ?? 1,
    expansion?.maximum ?? expansion?.minimum ?? 1,
  ) };
}

function instruction(
  direction: TailRepairEditInstruction["direction"],
  minimumCharacters: number,
  maximumCharacters: number,
): TailRepairEditInstruction {
  return { direction, minimumCharacters, maximumCharacters };
}
