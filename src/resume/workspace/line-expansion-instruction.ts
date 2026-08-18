import { bulletCharacterTargets } from "./character-targets.js";

export interface LineExpansionInstruction {
  currentCharacters: number;
  characterDelta: number;
  targetCharacters: number;
}

export function lineExpansionInstruction(
  text: string,
  measurement: {
    lineCount: number;
    lastLineWidthPx: number;
    availableLineWidthPx: number;
  },
): LineExpansionInstruction | undefined {
  const targets = bulletCharacterTargets(
    text,
    measurement.lineCount,
    measurement.lastLineWidthPx,
    measurement.availableLineWidthPx,
  );
  if (!targets) return undefined;
  const currentCharacters = [...text].length;
  const targetCharacters = Math.max(
    currentCharacters + 1,
    Math.round(
      (targets.addExactlyOneLine.minimum +
        targets.addExactlyOneLine.maximum) / 2,
    ),
  );
  return {
    currentCharacters,
    characterDelta: targetCharacters - currentCharacters,
    targetCharacters,
  };
}
