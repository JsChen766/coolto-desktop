export interface BulletCharacterTargets {
  currentCharacters: number;
  measuredAverageCharacterWidthPx: number;
  passCurrentLineCount: { minimum: number; maximum: number };
  addOneLineAnyTail: { minimum: number; maximum: number };
  addExactlyOneLine: { minimum: number; maximum: number };
}

const NEW_LINE_SAFETY_RATIO = 0.12;

export function bulletCharacterTargets(
  text: string,
  lineCount: number,
  lastLineWidthPx: number,
  lineWidthPx: number,
): BulletCharacterTargets | null {
  const characters = [...text].length;
  if (!characters || !lineCount || !lineWidthPx) return null;
  const measuredWidthPx =
    Math.max(0, lineCount - 1) * lineWidthPx + lastLineWidthPx;
  const averageCharacterWidthPx = measuredWidthPx / characters;
  if (!Number.isFinite(averageCharacterWidthPx) || averageCharacterWidthPx <= 0) {
    return null;
  }
  const addExactlyOneLine = targetCharacterRange(
    lineCount + 1,
    lineWidthPx,
    averageCharacterWidthPx,
  );
  return {
    currentCharacters: characters,
    measuredAverageCharacterWidthPx: round(averageCharacterWidthPx),
    passCurrentLineCount: targetCharacterRange(
      lineCount,
      lineWidthPx,
      averageCharacterWidthPx,
    ),
    addOneLineAnyTail: {
      minimum: Math.ceil(
        ((lineCount + NEW_LINE_SAFETY_RATIO) * lineWidthPx) /
          averageCharacterWidthPx,
      ),
      maximum: addExactlyOneLine.minimum,
    },
    addExactlyOneLine,
  };
}

function targetCharacterRange(
  lineCount: number,
  lineWidthPx: number,
  averageCharacterWidthPx: number,
): { minimum: number; maximum: number } {
  const fullLines = lineCount - 1;
  const minimum = Math.ceil(
    ((fullLines + 0.73) * lineWidthPx) / averageCharacterWidthPx,
  );
  return {
    minimum,
    maximum: Math.max(
      minimum,
      Math.floor(
        ((fullLines + 0.9) * lineWidthPx) / averageCharacterWidthPx,
      ),
    ),
  };
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
