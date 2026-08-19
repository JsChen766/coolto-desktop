export interface BulletTailGateInput {
  lastLineWidthPx: number;
  availableLineWidthPx: number;
  gateRatio: number;
  glyphTolerancePx: number;
}

/** A sub-glyph layout gap is not worth another semantic rewrite. */
export function passesBulletTailGate(input: BulletTailGateInput): boolean {
  const values = [
    input.lastLineWidthPx,
    input.availableLineWidthPx,
    input.gateRatio,
    input.glyphTolerancePx,
  ];
  if (!values.every(Number.isFinite) || input.availableLineWidthPx <= 0) {
    return false;
  }
  const requiredWidthPx = input.availableLineWidthPx * input.gateRatio;
  const deficitPx = requiredWidthPx - input.lastLineWidthPx;
  return deficitPx <= Math.max(0, input.glyphTolerancePx);
}
