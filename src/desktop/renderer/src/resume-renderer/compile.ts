import {
  RESUME_LAYOUT_TOLERANCE_PX,
  type ResumeCompileResult,
  type ResumeCompileViolation,
} from "../../../../resume/compiler-types";
import type { ResumeStructure } from "../../../../resume/types";
import { measureResumeDom } from "./dom-measurement";
import { waitForResumeFonts } from "./font-readiness";
import { renderResume } from "./render-dom";
import {
  effectiveTargetBand,
  requireResumeTemplate,
  resolveResumeTemplate,
} from "./template";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function appendLayoutViolations(
  violations: ResumeCompileViolation[],
  measurement: ReturnType<typeof measureResumeDom>,
  minimum: number,
  maximum: number,
): void {
  if (measurement.pageCount > 1) {
    violations.push({
      code: "multiple_pages",
      message: `Resume requires ${measurement.pageCount} pages.`,
    });
  }
  if (measurement.overflowPx > RESUME_LAYOUT_TOLERANCE_PX) {
    violations.push({
      code: "page_overflow",
      message: `Resume overflows the A4 content box by ${measurement.overflowPx.toFixed(1)}px.`,
    });
  }
  if (measurement.usageRatio < minimum) {
    violations.push({
      code: "page_underfilled",
      message: `Resume uses ${(measurement.usageRatio * 100).toFixed(1)}% of the content box; minimum is ${(minimum * 100).toFixed(1)}%.`,
    });
  }
  if (measurement.usageRatio > maximum) {
    violations.push({
      code: "page_overfilled",
      message: `Resume uses ${(measurement.usageRatio * 100).toFixed(1)}% of the content box; maximum is ${(maximum * 100).toFixed(1)}%.`,
    });
  }
}

export async function compileResume(
  root: HTMLElement,
  structure: ResumeStructure,
  fixtureId?: string,
): Promise<ResumeCompileResult> {
  const fallbackTemplate = requireResumeTemplate("resume-standard");
  const template = resolveResumeTemplate(structure);
  const selectedTemplate = template ?? fallbackTemplate;
  const targetBand = effectiveTargetBand(
    selectedTemplate,
    structure.layout_target_band,
  );
  const violations: ResumeCompileViolation[] = [];
  if (!template) {
    violations.push({
      code: "profile_mismatch",
      message: "Resume template profile/version/hash does not match the App manifest.",
    });
  }
  const page = renderResume(root, structure, selectedTemplate);
  await nextFrame();
  let fontsReady = false;
  let loadedFontFamilies: string[] = [];
  try {
    const fontResult = await waitForResumeFonts(page, selectedTemplate);
    fontsReady = fontResult.ready;
    loadedFontFamilies = fontResult.loadedFamilies;
  } catch {
    fontsReady = false;
  }
  if (!fontsReady) {
    violations.push({
      code: "font_unavailable",
      message: "Required resume fonts were not loaded by Chromium.",
    });
  }
  await nextFrame();
  await nextFrame();
  const measurement = measureResumeDom(page, selectedTemplate.bullet.gate_ratio);
  violations.push(...measurement.violations);
  appendLayoutViolations(
    violations,
    measurement,
    targetBand.minimum,
    targetBand.maximum,
  );
  return {
    ...(fixtureId ? { fixtureId } : {}),
    templateId: selectedTemplate.template_id,
    profileVersion: selectedTemplate.profile_version,
    profileHash: selectedTemplate.profile_hash,
    qualified: violations.length === 0,
    fontsReady,
    loadedFontFamilies,
    pageCount: measurement.pageCount,
    overflowPx: round(measurement.overflowPx),
    usedHeightPx: round(measurement.usedHeightPx),
    availableHeightPx: round(measurement.availableHeightPx),
    bodyLineHeightPx: round(measurement.bodyLineHeightPx),
    usageRatio: round(measurement.usageRatio),
    effectiveTargetBand: targetBand,
    bullets: measurement.bullets,
    violations,
  };
}
