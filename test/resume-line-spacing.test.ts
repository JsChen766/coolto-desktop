import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RESUME_LINE_SPACING_MAX_PERCENT,
  RESUME_LINE_SPACING_MIN_PERCENT,
  defaultResumeBodyLineHeight,
  maximumSafeResumeLineSpacingPercent,
  resumeLineSpacingPercent,
  scaledResumeBodyLineHeight,
  withResumeLineSpacing,
} from "../src/resume/layout-line-spacing.js";
import { getResumeFixture } from "../src/resume/fixtures.js";

test("resume line spacing maps the confirmed 90%-135% range to template tuning", () => {
  const source = getResumeFixture("zh-qualified");
  const compact = withResumeLineSpacing(source, RESUME_LINE_SPACING_MIN_PERCENT);
  const spacious = withResumeLineSpacing(source, RESUME_LINE_SPACING_MAX_PERCENT);

  assert.equal(source.layout_tuning.body_line_height, 1.18);
  assert.equal(compact.layout_tuning?.body_line_height, 1.062);
  assert.equal(spacious.layout_tuning?.body_line_height, 1.593);
  assert.equal(resumeLineSpacingPercent(compact), 90);
  assert.equal(resumeLineSpacingPercent(spacious), 135);
  assert.equal(source.layout_tuning.body_line_height, 1.18);
  assert.throws(() => scaledResumeBodyLineHeight(1.18, 89), /90%–135%/u);
});

test("dynamic line spacing limit stops at the last one-page and quality-safe step", () => {
  const measured: number[] = [];
  const maximum = maximumSafeResumeLineSpacingPercent({
    maximumUsageRatio: 0.98,
    layoutTolerancePx: 1,
    measure: (percent) => {
      measured.push(percent);
      return {
        pageCount: percent >= 120 ? 2 : 1,
        overflowPx: percent >= 120 ? 12 : 0,
        usageRatio: 0.75 + (percent - 90) * 0.01,
      };
    },
  });

  assert.equal(maximum, 113);
  assert.deepEqual(measured.at(-1), 114);
});

test("shared line spacing baselines stay aligned with the renderer manifest", async () => {
  const manifest = JSON.parse(await readFile(new URL(
    "../src/desktop/renderer/src/resume/template/resume-layout-templates-v1.json",
    import.meta.url,
  ), "utf8")) as {
    templates: Array<{
      template_id: "resume-standard" | "resume-sparse";
      styles: { body: { line_height: number } };
    }>;
  };
  for (const template of manifest.templates) {
    assert.equal(
      defaultResumeBodyLineHeight(template.template_id),
      template.styles.body.line_height,
    );
  }
});
