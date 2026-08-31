import type { ResumeWorkspaceStatus } from
  "../../../../resume/workspace/types.js";
import { translate } from "../i18n/locale.js";

export function resumeDraftProgressLabel(input: {
  workspaceStatus?: ResumeWorkspaceStatus;
  generationReady?: boolean;
}): string {
  if (input.generationReady === true) return "";
  if (input.workspaceStatus === "needs_user_decision") {
    return translate("等待补充材料");
  }
  if (input.workspaceStatus === "needs_revision") {
    return translate("需要继续完善");
  }
  if (input.workspaceStatus === "layout_qualified" ||
      input.workspaceStatus === "ready_for_approval") {
    return translate("等待内容确认");
  }
  return input.workspaceStatus ? translate("生成未完成") : "";
}
