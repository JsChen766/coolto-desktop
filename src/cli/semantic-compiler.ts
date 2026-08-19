import {
  RESUME_DEFAULT_TARGET_USAGE_RATIO,
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  type ResumeCompileResult,
  type ResumeCompileViolation,
} from "../resume/compiler-types.js";
import { passesBulletTailGate } from "../resume/bullet-tail-gate.js";
import type { ResumeStructure } from "../resume/types.js";
import type { ResumeCompiler } from "../resume/workspace/compiler-port.js";

/**
 * Calibrated semantic compile for the CLI host (no Electron/Chromium).
 *
 * Line estimation uses pixel widths (CJK glyph = 13px, half-width = 7px)
 * against the real 690px body line width; vertical rhythm matches the
 * standard template (lineHeightPx=15.34, availableHeightPx=1054, ~68.7
 * lines; fixed = contact 2 + section headings 1 + item headings 2).
 *
 * Calibration samples (real Chromium vs this compiler): the verified
 * qualified fixture passes at 0.873, and a real generated draft scores
 * 0.757/11 tail violations here vs 0.817/12 in real Chromium — the
 * qualified/unqualified verdict matches on both samples.
 */
export class CliSemanticCompiler implements ResumeCompiler {
  public compileCount = 0;
  public readonly availableLineWidthPx = 690;
  public readonly cjkGlyphWidthPx = 13;
  public readonly halfGlyphWidthPx = 7;

  public async compile(structure: ResumeStructure): Promise<ResumeCompileResult> {
    this.compileCount += 1;
    const lineHeightPx = 15.34;
    const availableHeightPx = 1054;
    const totalLines = Math.max(1, availableHeightPx / lineHeightPx);
    const fixedLines =
      2 +
      structure.sections.length +
      structure.sections.flatMap((section) => section.items).length * 2;

    const measurements = [];
    const violations: ResumeCompileViolation[] = [];
    let usedLines = fixedLines;
    for (const section of structure.sections) {
      for (const item of section.items) {
        for (const bullet of item.bullets) {
          if (!bullet.text.trim()) {
            violations.push({
              code: "empty_bullet",
              message: `Bullet ${bullet.id} is empty.`,
              bulletId: bullet.id,
            });
            continue;
          }
          const widthPx = estimateTextWidthPx(
            bullet.text,
            this.cjkGlyphWidthPx,
            this.halfGlyphWidthPx,
          );
          const lineCount = Math.max(
            1,
            Math.ceil(widthPx / this.availableLineWidthPx),
          );
          const lastLineWidthPx = widthPx % this.availableLineWidthPx;
          const lastLineRatio =
            lineCount === 1 ? 1 : lastLineWidthPx / this.availableLineWidthPx;
          const passed = passesBulletTailGate({
            lastLineWidthPx,
            availableLineWidthPx: this.availableLineWidthPx,
            gateRatio: 0.7,
            glyphTolerancePx: this.cjkGlyphWidthPx,
          });
          usedLines += lineCount;
          if (!passed) {
            violations.push({
              code: "bullet_tail_too_short",
              message: `Bullet ${bullet.id} last line covers ${(lastLineRatio * 100).toFixed(1)}% of the line width.`,
              bulletId: bullet.id,
            });
          }
          measurements.push({
            bulletId: bullet.id,
            lineCount,
            lastLineWidthPx: Math.round(lastLineWidthPx),
            availableLineWidthPx: this.availableLineWidthPx,
            lastLineRatio: Number(lastLineRatio.toFixed(4)),
            passed,
          });
        }
      }
    }

    const usageRatio = Number(
      Math.min(1.05, usedLines / totalLines).toFixed(4),
    );
    if (usageRatio > 1) {
      violations.push({
        code: "page_overflow",
        message: `Page usage ${(usageRatio * 100).toFixed(1)}% exceeds the page.`,
      });
    } else if (usageRatio < RESUME_GLOBAL_MINIMUM_USAGE_RATIO) {
      violations.push({
        code: "page_underfilled",
        message: `Page usage ${(usageRatio * 100).toFixed(1)}% is below the ${(RESUME_GLOBAL_MINIMUM_USAGE_RATIO * 100).toFixed(0)}% minimum.`,
      });
    }

    const usedHeightPx = usedLines * lineHeightPx;
    return {
      templateId: "resume-standard",
      profileVersion: "resume-template-v2",
      profileHash: "sha256:cli-calibrated",
      qualified: violations.length === 0,
      fontsReady: true,
      loadedFontFamilies: ["SimSun", "Times New Roman"],
      observedAt: new Date().toISOString(),
      viewport: { widthPx: 1280, heightPx: 900, devicePixelRatio: 1 },
      pageCount: usageRatio > 1 ? 2 : 1,
      overflowPx: usageRatio > 1 ? Math.round((usageRatio - 1) * availableHeightPx) : 0,
      usedHeightPx: Math.round(usedHeightPx),
      availableHeightPx,
      bodyLineHeightPx: lineHeightPx,
      bodyFontSizePx: 13,
      usageRatio,
      effectiveTargetBand: {
        minimum: RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
        target: RESUME_DEFAULT_TARGET_USAGE_RATIO,
        maximum: 0.98,
      },
      bullets: measurements,
      violations,
    };
  }
}

function estimateTextWidthPx(
  text: string,
  cjkGlyphWidthPx: number,
  halfGlyphWidthPx: number,
): number {
  let width = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    const cjk =
      code >= 0x4e00 ||
      code === 0x3000 ||
      code === 0xff0c ||
      code === 0xff01 ||
      code === 0xff1f ||
      code === 0xff0e;
    width += cjk ? cjkGlyphWidthPx : halfGlyphWidthPx;
  }
  return width;
}
