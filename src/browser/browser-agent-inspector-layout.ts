export type BrowserAgentInspectorLayoutMode = "closed" | "docked" | "overlay";

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
  const mode: Exclude<BrowserAgentInspectorLayoutMode, "closed"> =
    cssViewportWidth >= 940 ? "docked" : "overlay";
  const panelCssWidth = cssViewportWidth >= 1_100
    ? 360
    : cssViewportWidth >= 940
      ? 320
      : Math.min(360, cssViewportWidth);
  const panelWidth = clamp(Math.round(panelCssWidth * zoom), 1, width);
  const panelBounds = {
    x: width - panelWidth,
    y: chromeHeight,
    width: panelWidth,
    height: height - chromeHeight,
  };
  return {
    mode,
    panelBounds,
    pageRightInset: mode === "docked" ? panelWidth : 0,
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
