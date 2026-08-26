import {
  type ResumeBulletMeasurement,
  type ResumeCompileViolation,
} from "../../../../resume/compiler-types";
import { passesBulletTailGate } from
  "../../../../resume/bullet-tail-gate";
import type { ResumeTailPolicy } from "../../../../resume/tail-policy";
import {
  RESUME_TAIL_POLICY_V1,
  RESUME_TAIL_POLICY_V2,
} from "../../../../resume/tail-policy";
import { measureTailBudgetProbe } from "./tail-budget-probe";
import { measureInlineWidthPx } from "./text-width-calibration";
import { measureVisualLines } from "./visual-line-measurement";

function round(value: number): number {
  return Number(value.toFixed(4));
}

export function measureResumeBullets(
  page: HTMLElement,
  policy: ResumeTailPolicy,
  language: string,
): {
  bullets: ResumeBulletMeasurement[];
  violations: ResumeCompileViolation[];
} {
  const bullets: ResumeBulletMeasurement[] = [];
  const violations: ResumeCompileViolation[] = [];
  const seen = new Set<string>();
  for (const bullet of Array.from(
    page.querySelectorAll<HTMLElement>("[data-bullet-id]"),
  )) {
    const bulletId = (bullet.dataset.bulletId ?? "").trim();
    if (!bulletId) {
      violations.push({
        code: "missing_bullet_id",
        message: "A rendered bullet is missing its stable ID.",
      });
      continue;
    }
    if (seen.has(bulletId)) {
      violations.push({
        code: "duplicate_bullet_id",
        message: `Duplicate bullet ID: ${bulletId}`,
        bulletId,
      });
      continue;
    }
    seen.add(bulletId);
    const text = bullet.querySelector<HTMLElement>(
      ".resume-document-bullet-text",
    );
    if (!text || !(text.textContent ?? "").trim()) {
      violations.push({
        code: "empty_bullet",
        message: `Bullet ${bulletId} has no visible text.`,
        bulletId,
      });
      continue;
    }
    const style = getComputedStyle(text);
    const horizontalPadding =
      Number.parseFloat(style.paddingLeft || "0") +
      Number.parseFloat(style.paddingRight || "0");
    const availableLineWidthPx = text.clientWidth - horizontalPadding;
    const lines = measureVisualLines(text);
    if (
      !Number.isFinite(availableLineWidthPx) ||
      availableLineWidthPx <= 0 ||
      !lines.length
    ) {
      violations.push({
        code: "invalid_bullet_geometry",
        message: `Bullet ${bulletId} has invalid DOM geometry.`,
        bulletId,
      });
      continue;
    }
    const lastLine = lines.at(-1);
    if (!lastLine) continue;
    const lastLineWidthPx = lastLine.right - lastLine.left;
    const lastLineRatio = lastLineWidthPx / availableLineWidthPx;
    const fontSizePx = Number.parseFloat(style.fontSize || "0");
    const passed = passesBulletTailGate({
      lastLineWidthPx,
      availableLineWidthPx,
      policy,
      fontSizePx,
    });
    let ceuPx = 0;
    let noWrapTextWidthPx = 0;
    let tailProbe: ResumeBulletMeasurement["tailProbe"];
    try {
      const result = measureTailBudgetProbe({
        target: text,
        language,
        availableLineWidthPx,
        currentLineCount: lines.length,
        policy,
      });
      ceuPx = result.ceuPx;
      noWrapTextWidthPx = measureInlineWidthPx(
        text,
        text.textContent ?? "",
      );
      tailProbe = result.probe;
    } catch {
      violations.push({
        code: "text_width_calibration_failed",
        message: `Bullet ${bulletId} could not calibrate its CJK width.`,
        bulletId,
      });
    }
    bullets.push({
      bulletId,
      lineCount: lines.length,
      lastLineWidthPx: round(lastLineWidthPx),
      availableLineWidthPx: round(availableLineWidthPx),
      lastLineRatio: round(lastLineRatio),
      fontSizePx: round(fontSizePx),
      ceuPx: round(ceuPx),
      noWrapTextWidthPx: round(noWrapTextWidthPx),
      noWrapTextCjk: ceuPx > 0 ? round(noWrapTextWidthPx / ceuPx) : 0,
      tailPolicyVersion: policy.version,
      tailPolicyShadow: {
        v1Passed: passesBulletTailGate({
          lastLineWidthPx,
          availableLineWidthPx,
          policy: RESUME_TAIL_POLICY_V1,
          fontSizePx,
        }),
        v2Passed: passesBulletTailGate({
          lastLineWidthPx,
          availableLineWidthPx,
          policy: RESUME_TAIL_POLICY_V2,
          fontSizePx,
        }),
      },
      ...(tailProbe ? { tailProbe } : {}),
      passed,
    });
    if (!passed) {
      violations.push({
        code: "bullet_tail_too_short",
        message: `Bullet ${bulletId} last line uses ${(lastLineRatio * 100).toFixed(1)}% of the available width.`,
        bulletId,
      });
    }
  }
  return { bullets, violations };
}
