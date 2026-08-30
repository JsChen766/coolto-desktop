export const DEFAULT_BROWSER_ZOOM_FACTOR = 1;

export const BROWSER_ZOOM_FACTORS = [
  0.25,
  0.33,
  0.5,
  0.67,
  0.75,
  0.8,
  0.9,
  1,
  1.1,
  1.25,
  1.5,
  1.75,
  2,
  2.5,
  3,
  4,
  5,
] as const;

export type BrowserZoomDirection = "in" | "out";

export function stepBrowserZoomFactor(
  current: number,
  direction: BrowserZoomDirection,
): number {
  const value = Number.isFinite(current) ? current : DEFAULT_BROWSER_ZOOM_FACTOR;
  if (direction === "in") {
    return BROWSER_ZOOM_FACTORS.find((factor) => factor > value + Number.EPSILON)
      ?? BROWSER_ZOOM_FACTORS.at(-1)!;
  }
  return BROWSER_ZOOM_FACTORS.findLast(
    (factor) => factor < value - Number.EPSILON,
  ) ?? BROWSER_ZOOM_FACTORS[0];
}

export function normalizeBrowserZoomFactor(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BROWSER_ZOOM_FACTOR;
  return BROWSER_ZOOM_FACTORS.reduce((nearest, factor) =>
    Math.abs(factor - value) < Math.abs(nearest - value) ? factor : nearest,
  DEFAULT_BROWSER_ZOOM_FACTOR);
}

export function browserZoomPercent(factor: number): number {
  return Math.round(normalizeBrowserZoomFactor(factor) * 100);
}
