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
    title: payload.mode === "new_resume" ? "保存新简历" : "保存简历新版本",
    description:
      "接受后将创建 staged 版本，服务端复验来源和 Chromium 布局，通过后才设为 active。",
    preview: {
      summary: [
        { label: "简历标题", value: payload.title },
        { label: "目标岗位", value: payload.targetRole ?? "未设置" },
        { label: "保存方式", value: payload.mode === "new_resume" ? "新建简历" : "新增版本" },
        { label: "页面占比", value: `${(payload.observation.used_height_px / payload.observation.available_height_px * 100).toFixed(2)}%` },
        { label: "最低尾行", value: `${(minimumTail * 100).toFixed(2)}%` },
        { label: "模板", value: `${payload.observation.template_id} / ${payload.observation.profile_version}` },
      ],
      items: [
        {
          title: "将影响的云端固定资产",
          description:
            payload.mode === "new_resume"
              ? "创建 1 份 Resume 和首个 ResumeVariant"
              : `为 Resume ${payload.resumeId} 创建 1 个新版本`,
        },
      ],
      warnings: ["来源或 active version 在审批期间变化时，保存会失败并要求重新确认。"],
    },
  };
}
