import type { ApprovalDraft } from "../../approvals/types.js";
import type { ResumePdfExportApprovalPayload } from "./types.js";

export const RESUME_PDF_EXPORT_ACTION_TYPE = "resume.pdf_export";

export function createResumePdfExportApprovalDraft(
  payload: ResumePdfExportApprovalPayload,
): ApprovalDraft {
  const tailRatios = payload.compileResult.bullets.map(
    (bullet) => bullet.lastLineRatio,
  );
  const minimumTail = tailRatios.length ? Math.min(...tailRatios) : 0;
  return {
    actionType: RESUME_PDF_EXPORT_ACTION_TYPE,
    scopeKey: `resume-pdf-export:${payload.source}:${payload.candidateId ?? payload.resumeId}`,
    risk: "write",
    title: "导出简历 PDF",
    description:
      "接受后将打开系统保存位置选择器，并使用同一 Chromium 简历模板生成和复验 PDF。",
    preview: {
      summary: [
        { label: "简历", value: payload.title },
        { label: "建议文件名", value: payload.suggestedFilename },
        {
          label: "来源",
          value: payload.source === "candidate" ? "已通过质量门的候选" : "正式 active 版本",
        },
        { label: "页数", value: String(payload.compileResult.pageCount) },
        { label: "页面占比", value: `${(payload.compileResult.usageRatio * 100).toFixed(2)}%` },
        { label: "最低尾行", value: `${(minimumTail * 100).toFixed(2)}%` },
      ],
      items: [{
        title: "本地文件写入",
        description: "实际路径只能在系统保存对话框中由你选择；PDF 不会上传。",
      }],
      warnings: ["关闭或取消系统保存对话框不会创建文件。"],
    },
  };
}
