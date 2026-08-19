import type { ResumeCompiler } from "../workspace/compiler-port.js";
import type { ResumeCompileResult } from "../compiler-types.js";
import type { ResumeStructure } from "../types.js";
import type { PlanningParameters } from "./planner.js";

export interface TypographyCalibration {
  parameters: PlanningParameters;
  /** 空骨架本次编译结果：prepare_resume_draft 直接复用，避免第三次编译。 */
  emptyCompileResult: ResumeCompileResult;
}

/**
 * Calibrates typography with two real Chromium compiles: an empty skeleton
 * measures fixed overhead lines; one skeleton with a long bullet measures
 * characters per line.
 */
export async function calibrateTypography(
  compiler: ResumeCompiler,
  skeleton: ResumeStructure,
  language: "zh-CN" | "en-US",
): Promise<TypographyCalibration> {
  const empty = await compiler.compile(skeleton);
  const lineHeightPx = empty.bodyLineHeightPx;
  const fixedLines = Math.max(
    1,
    Math.round(empty.usedHeightPx / Math.max(1, lineHeightPx)),
  );
  const withBullet = structuredClone(skeleton);
  const workItem = withBullet.sections
    .flatMap((section) => section.items)
    .find((item) => item.source_experience_id);
  if (!workItem) throw new Error("Calibration skeleton has no source item");
  workItem.bullets = [
    {
      id: "calibration-bullet",
      text:
        language === "zh-CN"
          ? "负责产品团队的核心模块，主导大模型应用项目的落地推进，将响应延迟从 3.2 秒优化至 1.8 秒，覆盖 2000 个核心用户，并沉淀可复用的工程方法论。"
          : "Owned the core module of the product team, led the delivery of the large-model application project, cut response latency from 3.2s to 1.8s, and covered 2,000 primary users with reusable engineering practices.",
      matched_jd_requirement_ids: [],
    },
  ];
  const measured = await compiler.compile(withBullet);
  const widthPx = measured.bullets[0]?.availableLineWidthPx ?? 711;
  const fontSize = measured.bodyFontSizePx > 0 ? measured.bodyFontSizePx : 13;
  const charsPerLine =
    language === "zh-CN"
      ? Math.max(20, Math.round(widthPx / fontSize))
      : Math.max(30, Math.round((widthPx / fontSize) * 1.9));
  return {
    parameters: {
      charsPerLine,
      lineHeightPx,
      availableHeightPx: measured.availableHeightPx,
      fixedLines,
    },
    emptyCompileResult: empty,
  };
}
