import type { ResumeCompileResult } from "../../src/resume/compiler-types.js";
import type { ResumeStructure } from "../../src/resume/types.js";
import type { ResumeCompiler } from "../../src/resume/workspace/compiler-port.js";

export class SemanticEvalCompiler implements ResumeCompiler {
  public compileCount = 0;

  public async compile(structure: ResumeStructure): Promise<ResumeCompileResult> {
    this.compileCount += 1;
    const bullets = structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets),
    );
    const usageRatio = Math.min(1.03, 0.65 + bullets.length * 0.12);
    const underfilled = usageRatio < 0.85;
    return {
      templateId: "resume-standard",
      profileVersion: "resume-template-v2",
      profileHash:
        "130b516b3eb2f0a5a335ff525eebd3ca43dcce1053ab02a06d384e3a18f09fc0",
      qualified: !underfilled,
      fontsReady: true,
      loadedFontFamilies: ["SimSun", "Times New Roman"],
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: usageRatio * 1000,
      availableHeightPx: 1000,
      bodyLineHeightPx: 20,
      usageRatio,
      effectiveTargetBand: { minimum: 0.85, target: 0.9, maximum: 0.98 },
      bullets: bullets.map((bullet) => ({
        bulletId: bullet.id,
        lineCount: 2,
        lastLineWidthPx: 480,
        availableLineWidthPx: 600,
        lastLineRatio: 0.8,
        passed: true,
      })),
      violations: underfilled
        ? [{ code: "page_underfilled", message: "Page is underfilled." }]
        : [],
    };
  }
}
