import type {
  ResumeStructure,
  ResumeTemplateId,
} from "./types.js";

export const RESUME_LINE_SPACING_MIN_PERCENT = 90;
export const RESUME_LINE_SPACING_DEFAULT_PERCENT = 100;
export const RESUME_LINE_SPACING_MAX_PERCENT = 135;
export const RESUME_LINE_SPACING_STEP_PERCENT = 1;

const DEFAULT_BODY_LINE_HEIGHT: Record<ResumeTemplateId, number> = {
  "resume-standard": 1.18,
  "resume-sparse": 1.25,
};

export interface ResumeLineSpacingMeasurement {
  pageCount: number;
  overflowPx: number;
  usageRatio: number;
}

export function defaultResumeBodyLineHeight(
  templateId: ResumeTemplateId | undefined,
): number {
  return DEFAULT_BODY_LINE_HEIGHT[templateId ?? "resume-standard"];
}

export function assertResumeLineSpacingPercent(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < RESUME_LINE_SPACING_MIN_PERCENT ||
    value > RESUME_LINE_SPACING_MAX_PERCENT
  ) {
    throw new Error(
      `简历行间距必须是 ${RESUME_LINE_SPACING_MIN_PERCENT}%–${RESUME_LINE_SPACING_MAX_PERCENT}% 之间的整数`,
    );
  }
  return value;
}

export function clampResumeLineSpacingPercent(value: number): number {
  const rounded = Number.isFinite(value)
    ? Math.round(value)
    : RESUME_LINE_SPACING_DEFAULT_PERCENT;
  return Math.min(
    RESUME_LINE_SPACING_MAX_PERCENT,
    Math.max(RESUME_LINE_SPACING_MIN_PERCENT, rounded),
  );
}

export function scaledResumeBodyLineHeight(
  defaultLineHeight: number,
  percent: number,
): number {
  return Number(
    (defaultLineHeight * assertResumeLineSpacingPercent(percent) / 100).toFixed(4),
  );
}

export function resumeLineSpacingPercent(
  structure: ResumeStructure,
): number {
  const baseline = defaultResumeBodyLineHeight(structure.layout_template_id);
  const current = structure.layout_tuning?.body_line_height ?? baseline;
  return clampResumeLineSpacingPercent((current / baseline) * 100);
}

export function withResumeLineSpacing(
  source: ResumeStructure,
  percent: number,
): ResumeStructure {
  const baseline = defaultResumeBodyLineHeight(source.layout_template_id);
  const current = source.layout_tuning;
  return {
    ...structuredClone(source),
    layout_tuning: {
      body_font_scale: current?.body_font_scale ?? 1,
      body_line_height: scaledResumeBodyLineHeight(baseline, percent),
      section_gap_scale: current?.section_gap_scale ?? 1,
      item_gap_scale: current?.item_gap_scale ?? 1,
      bullet_gap_scale: current?.bullet_gap_scale ?? 1,
    },
  };
}

export function maximumSafeResumeLineSpacingPercent(input: {
  measure: (percent: number) => ResumeLineSpacingMeasurement;
  maximumUsageRatio: number;
  layoutTolerancePx: number;
}): number {
  let maximum = RESUME_LINE_SPACING_MIN_PERCENT;
  for (
    let percent = RESUME_LINE_SPACING_MIN_PERCENT;
    percent <= RESUME_LINE_SPACING_MAX_PERCENT;
    percent += RESUME_LINE_SPACING_STEP_PERCENT
  ) {
    const result = input.measure(percent);
    const safe =
      result.pageCount === 1 &&
      result.overflowPx <= input.layoutTolerancePx &&
      result.usageRatio <= input.maximumUsageRatio;
    if (!safe) break;
    maximum = percent;
  }
  return maximum;
}
