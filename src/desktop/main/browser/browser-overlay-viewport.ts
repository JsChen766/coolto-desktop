export interface BrowserOverlayRectEdges {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export type BrowserOverlayViewportEdges = BrowserOverlayRectEdges;

export function browserOverlayRectCoversViewport(
  rect: BrowserOverlayRectEdges,
  viewport: BrowserOverlayViewportEdges,
  deviceScaleFactor: number,
): boolean {
  const epsilon = 1 / Math.max(
    Number.isFinite(deviceScaleFactor) ? deviceScaleFactor : 1,
    1,
  );
  return rect.left <= viewport.left + epsilon
    && rect.right + epsilon >= viewport.right
    && rect.top <= viewport.top + epsilon
    && rect.bottom + epsilon >= viewport.bottom;
}

export function browserOverlayTopBarCoversViewport(
  rect: BrowserOverlayRectEdges & { height: number },
  viewport: BrowserOverlayViewportEdges,
  deviceScaleFactor: number,
): boolean {
  const epsilon = 1 / Math.max(
    Number.isFinite(deviceScaleFactor) ? deviceScaleFactor : 1,
    1,
  );
  return rect.left <= viewport.left + epsilon
    && rect.right + epsilon >= viewport.right
    && rect.top <= viewport.top + epsilon
    && rect.height >= 30;
}

export const OVERLAY_VIEWPORT_RUNTIME_SCRIPT = `
  const browserOverlayRectCoversViewport = ${browserOverlayRectCoversViewport.toString()};
  const browserOverlayTopBarCoversViewport = ${browserOverlayTopBarCoversViewport.toString()};
`;
