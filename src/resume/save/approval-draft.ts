import type { ApprovalDraft } from "../../approvals/types.js";
import type { ResumeSaveApprovalPayload } from "./types.js";

export const RESUME_SAVE_ACTION_TYPE = "resume.save";

export function createResumeSaveApprovalDraft(
  payload: ResumeSaveApprovalPayload,
): ApprovalDraft {
  const ratios = payload.observation.bullets.map(
    (bullet) => bullet.last_line_width_px / bullet.available_line_width_px,
  );
  const minimumTail = ratios.length ? Math.min(...ratios) : 0;
  return {
    actionType: RESUME_SAVE_ACTION_TYPE,
    scopeKey: `resume-save:${payload.candidateId}`,
    risk: "write",
    title: payload.mode === "new_resume" ? "保存新简历" : "覆盖云端简历",
    description:
      "接受后服务端将原子复验来源和 Chromium 布局；全部通过才写入唯一的云端简历文档。",
    preview: {
      summary: [
        { label: "简历标题", value: payload.title },
        { label: "目标岗位", value: payload.targetRole ?? "未设置" },
        { label: "保存方式", value: payload.mode === "new_resume" ? "新建简历" : "覆盖当前文档" },
        { label: "页面占比", value: `${(payload.observation.used_height_px / payload.observation.available_height_px * 100).toFixed(2)}%` },
        { label: "最低尾行", value: `${(minimumTail * 100).toFixed(2)}%` },
        { label: "模板", value: `${payload.observation.template_id} / ${payload.observation.profile_version}` },
      ],
      items: [
        {
          title: "将影响的云端固定资产",
          description:
            payload.mode === "new_resume"
              ? "创建 1 份 Resume"
              : `原子替换 Resume ${payload.resumeId} 的当前内容`,
        },
      ],
      warnings: ["云端 contentHash 在审批期间变化时，保存会失败并要求重新确认。"],
    },
  };
}
