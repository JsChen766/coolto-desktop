export type BrowserAgentInspectorLayoutMode = "closed" | "overlay";

export interface BrowserAgentInspectorLayoutInput {
  windowWidthDip: number;
  windowHeightDip: number;
  shellZoomFactor: number;
  chromeHeight: number;
  open: boolean;
}

export interface BrowserAgentInspectorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserAgentInspectorLayout {
  mode: BrowserAgentInspectorLayoutMode;
  panelBounds: BrowserAgentInspectorBounds | null;
  pageRightInset: number;
}

const MIN_SHELL_ZOOM_FACTOR = 0.25;
const MAX_SHELL_ZOOM_FACTOR = 5;
const MAX_WINDOW_DIP = 100_000;
const FLOATING_PANEL_WIDTH_CSS = 380;
const FLOATING_PANEL_EDGE_CSS = 12;
const FLOATING_PANEL_NARROW_EDGE_CSS = 8;
const FLOATING_PANEL_SHADOW_CSS = 8;

export function browserChromeHeightDip(
  cssHeight: number,
  shellZoomFactor: number,
): number {
  const zoom = shellZoom(shellZoomFactor);
  if (!Number.isFinite(cssHeight) || cssHeight <= 0 || zoom === null) return 0;
  return Math.round(cssHeight * zoom);
}

const CLOSED_LAYOUT: BrowserAgentInspectorLayout = Object.freeze({
  mode: "closed",
  panelBounds: null,
  pageRightInset: 0,
});

export function resolveBrowserAgentInspectorLayout(
  input: BrowserAgentInspectorLayoutInput,
): BrowserAgentInspectorLayout {
  if (input.open !== true) return { ...CLOSED_LAYOUT };
  const width = windowDip(input.windowWidthDip);
  const height = windowDip(input.windowHeightDip);
  const zoom = shellZoom(input.shellZoomFactor);
  if (width === null || height === null || zoom === null ||
      !Number.isFinite(input.chromeHeight)) {
    return { ...CLOSED_LAYOUT };
  }

  const chromeHeight = clamp(Math.round(input.chromeHeight), 0, height);
  if (chromeHeight >= height) return { ...CLOSED_LAYOUT };
  const cssViewportWidth = width / zoom;
  const edgeCss = cssViewportWidth <= 720
    ? FLOATING_PANEL_NARROW_EDGE_CSS
    : FLOATING_PANEL_EDGE_CSS;
  const visualWidthCss = Math.min(
    FLOATING_PANEL_WIDTH_CSS,
    Math.max(1, cssViewportWidth - edgeCss * 2),
  );
  const shadowDip = Math.round(FLOATING_PANEL_SHADOW_CSS * zoom);
  const edgeDip = Math.round(edgeCss * zoom);
  const visualWidthDip = Math.round(visualWidthCss * zoom);
  const panelX = Math.max(0, width - edgeDip - visualWidthDip - shadowDip);
  const panelY = chromeHeight + Math.max(0, edgeDip - shadowDip);
  const panelWidth = clamp(visualWidthDip + shadowDip * 2, 1, width - panelX);
  const bottomInset = Math.max(0, edgeDip - shadowDip);
  const panelHeight = height - panelY - bottomInset;
  if (panelHeight <= 0) return { ...CLOSED_LAYOUT };
  const panelBounds = {
    x: panelX,
    y: panelY,
    width: panelWidth,
    height: panelHeight,
  };
  return {
    mode: "overlay",
    panelBounds,
    pageRightInset: 0,
  };
}

function windowDip(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return clamp(Math.round(value), 1, MAX_WINDOW_DIP);
}

function shellZoom(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return clamp(value, MIN_SHELL_ZOOM_FACTOR, MAX_SHELL_ZOOM_FACTOR);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
