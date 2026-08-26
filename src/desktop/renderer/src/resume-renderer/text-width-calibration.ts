const STYLE_PROPERTIES = [
  "font-family", "font-size", "font-weight", "font-style", "font-stretch",
  "font-kerning", "font-feature-settings", "font-variant", "line-height", "letter-spacing",
  "word-spacing", "direction", "text-rendering",
] as const;

export interface TextWidthCalibration {
  styleSignature: string;
  ceuPx: number;
}

const calibrationCache = new Map<string, TextWidthCalibration>();

export function calibrateTextWidth(
  target: HTMLElement,
): TextWidthCalibration {
  const computed = getComputedStyle(target);
  const styleSignature = STYLE_PROPERTIES
    .map((property) => `${property}:${computed.getPropertyValue(property)}`)
    .join("|");
  const cached = calibrationCache.get(styleSignature);
  if (cached) return cached;
  const sample = "水".repeat(16);
  const ceuPx = measureInlineWidthPx(target, sample) / 16;
  if (!Number.isFinite(ceuPx) || ceuPx <= 0) {
    throw new Error("Unable to calibrate the current CJK equivalent width.");
  }
  const calibration = { styleSignature, ceuPx };
  calibrationCache.set(styleSignature, calibration);
  return calibration;
}

export function measureInlineWidthPx(
  target: HTMLElement,
  text: string,
): number {
  if (!text) return 0;
  const probe = document.createElement("span");
  probe.textContent = text;
  copyTextMeasurementStyle(target, probe);
  Object.assign(probe.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    display: "inline-block",
    whiteSpace: "pre",
    visibility: "hidden",
    pointerEvents: "none",
  });
  document.body.append(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

export function copyTextMeasurementStyle(
  source: HTMLElement,
  target: HTMLElement,
): void {
  const computed = getComputedStyle(source);
  for (const property of STYLE_PROPERTIES) {
    target.style.setProperty(property, computed.getPropertyValue(property));
  }
}
