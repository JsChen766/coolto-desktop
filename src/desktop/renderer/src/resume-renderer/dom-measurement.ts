import {
  RESUME_LAYOUT_TOLERANCE_PX,
  type ResumeBulletMeasurement,
  type ResumeCompileViolation,
} from "../../../../resume/compiler-types";
import { measureResumeBullets } from "./bullet-measurement";

export interface ResumeDomMeasurement {
  pageCount: number;
  overflowPx: number;
  usedHeightPx: number;
  availableHeightPx: number;
  bodyLineHeightPx: number;
  bodyFontSizePx: number;
  usageRatio: number;
  bullets: ResumeBulletMeasurement[];
  violations: ResumeCompileViolation[];
}

function lastMeaningfulBottom(content: HTMLElement, contentTop: number): number {
  const bottoms = Array.from(content.children)
    .filter(
      (candidate): candidate is HTMLElement => candidate instanceof HTMLElement,
    )
    .filter(
      (candidate) =>
        (candidate.textContent ?? "").trim() ||
        candidate.querySelector("img,svg,canvas"),
    )
    .map((candidate) => candidate.getBoundingClientRect().bottom - contentTop)
    .filter((value) => Number.isFinite(value) && value >= 0);
  return bottoms.length ? Math.max(...bottoms) : 0;
}

export function measureResumeDom(
  page: HTMLElement,
  gateRatio: number,
): ResumeDomMeasurement {
  const box = page.querySelector<HTMLElement>(".resume-document-content-box");
  const content = page.querySelector<HTMLElement>(".resume-document-content");
  if (!box || !content) {
    return {
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: 0,
      availableHeightPx: 0,
      bodyLineHeightPx: measureBodyLineHeight(page),
      bodyFontSizePx: measureBodyFontSize(page),
      usageRatio: 0,
      bullets: [],
      violations: [
        {
          code: "missing_measurement_nodes",
          message: "Resume measurement nodes are missing.",
        },
      ],
    };
  }
  const availableHeightPx = box.clientHeight;
  const bodyLineHeightPx = measureBodyLineHeight(page);
  const bodyFontSizePx = measureBodyFontSize(content);
  const contentTop = box.getBoundingClientRect().top;
  const usedHeightPx = lastMeaningfulBottom(content, contentTop);
  const scrollHeight = box.scrollHeight;
  const overflowPx = Math.max(0, scrollHeight - availableHeightPx);
  const pageCount = Math.max(
    1,
    Math.ceil(
      Math.max(0, scrollHeight - RESUME_LAYOUT_TOLERANCE_PX) /
        Math.max(1, availableHeightPx),
    ),
  );
  const usageRatio = availableHeightPx > 0 ? usedHeightPx / availableHeightPx : 0;
  const bulletResult = measureResumeBullets(page, gateRatio);
  const violations = [...bulletResult.violations];
  if (
    ![
      availableHeightPx,
      usedHeightPx,
      scrollHeight,
      overflowPx,
      usageRatio,
    ].every(Number.isFinite) ||
    availableHeightPx <= 0
  ) {
    violations.push({
      code: "invalid_page_geometry",
      message: "Resume page has invalid DOM geometry.",
    });
  }
  return {
    pageCount,
    overflowPx,
    usedHeightPx,
    availableHeightPx,
    bodyLineHeightPx,
    bodyFontSizePx,
    usageRatio,
    bullets: bulletResult.bullets,
    violations,
  };
}

function measureBodyFontSize(element: HTMLElement): number {
  const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 0;
}

function measureBodyLineHeight(page: HTMLElement): number {
  const style = getComputedStyle(page);
  const lineHeight = Number.parseFloat(style.lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
  const fontSize = Number.parseFloat(style.fontSize);
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.2 : 0;
}
