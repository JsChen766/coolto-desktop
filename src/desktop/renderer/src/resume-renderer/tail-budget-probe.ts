import type { ResumeTailProbeMeasurement } from
  "../../../../resume/compiler-types";
import type { ResumeTailPolicy } from "../../../../resume/tail-policy";
import {
  calibrateTextWidth,
  copyTextMeasurementStyle,
  measureInlineWidthPx,
} from "./text-width-calibration";
import { measureVisualLines } from "./visual-line-measurement";

interface ProbePoint {
  n: number;
  lineCount: number;
  ratio: number;
}

export function measureTailBudgetProbe(input: {
  target: HTMLElement;
  language: string;
  availableLineWidthPx: number;
  currentLineCount: number;
  policy: ResumeTailPolicy;
}): { ceuPx: number; probe: ResumeTailProbeMeasurement } {
  const calibration = calibrateTextWidth(input.target);
  const separatorText = tailSeparator(
    input.target.textContent ?? "",
    input.language,
  );
  const separatorWidthPx = measureInlineWidthPx(input.target, separatorText);
  const clone = createProbeClone(input.target, input.availableLineWidthPx);
  const growthNode = document.createTextNode("");
  clone.append(growthNode);
  document.body.append(clone);
  const maximum = Math.ceil(
    input.availableLineWidthPx / calibration.ceuPx,
  ) + 2;
  const points: ProbePoint[] = [];
  for (let n = 1; n <= maximum; n += 1) {
    growthNode.textContent = `${separatorText}${"水".repeat(n)}`;
    const lines = measureVisualLines(clone);
    const last = lines.at(-1);
    points.push({
      n,
      lineCount: lines.length,
      ratio: last
        ? (last.right - last.left) / input.availableLineWidthPx
        : 0,
    });
  }
  clone.remove();
  const sameLine = points.filter((point) =>
    point.lineCount === input.currentLineCount
  );
  return {
    ceuPx: calibration.ceuPx,
    probe: {
      styleSignature: calibration.styleSignature,
      separatorText,
      separatorWidthPx: round(separatorWidthPx),
      hardCjk: firstAtRatio(sameLine, input.policy.hardMinRatio),
      minCjk: firstAtRatio(sameLine, input.policy.repairMinRatio),
      idealCjk: closestToRatio(sameLine, input.policy.repairIdealRatio),
      maxCjk: lastAtOrBelow(sameLine, input.policy.repairSoftMaxRatio),
      wrapRisk: wrapRisk(input.target.textContent ?? "", sameLine),
    },
  };
}

function createProbeClone(target: HTMLElement, widthPx: number): HTMLElement {
  const clone = target.cloneNode(true) as HTMLElement;
  const computed = getComputedStyle(target);
  copyTextMeasurementStyle(target, clone);
  clone.removeAttribute("id");
  Object.assign(clone.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${widthPx}px`,
    height: "auto",
    maxHeight: "none",
    padding: "0",
    margin: "0",
    overflow: "visible",
    visibility: "hidden",
    pointerEvents: "none",
    boxSizing: "border-box",
    whiteSpace: computed.whiteSpace,
    overflowWrap: computed.overflowWrap,
    wordBreak: computed.wordBreak,
  });
  return clone;
}

function tailSeparator(text: string, language: string): string {
  const base = text.trim();
  if (/[，,；;:]$/u.test(base)) return "";
  return language === "en-US" ? "; " : "，";
}

function firstAtRatio(points: ProbePoint[], ratio: number): number | null {
  return points.find((point) => point.ratio >= ratio)?.n ?? null;
}

function closestToRatio(points: ProbePoint[], ratio: number): number | null {
  return points.reduce<ProbePoint | undefined>((best, point) =>
    !best || Math.abs(point.ratio - ratio) < Math.abs(best.ratio - ratio)
      ? point
      : best
  , undefined)?.n ?? null;
}

function lastAtOrBelow(points: ProbePoint[], ratio: number): number | null {
  return points.filter((point) => point.ratio <= ratio).at(-1)?.n ?? null;
}

function wrapRisk(text: string, points: ProbePoint[]): "low" | "medium" | "high" {
  const longestLatin = Math.max(0, ...(
    text.match(/[A-Za-z0-9._/+%-]+/gu)?.map((token) => token.length) ?? []
  ));
  if (!points.length || longestLatin >= 16) return "high";
  if (longestLatin >= 10) return "medium";
  return "low";
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
