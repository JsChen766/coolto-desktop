import { buildAgentSourceView } from "../../resume/workspace/agent-source-view.js";
import { buildAgentWorkspaceView } from "../../resume/workspace/agent-workspace-view.js";
import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import { wholePageWritingBudget } from "../../resume/workspace/whole-page-writing-budget.js";
import type { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";

export function rejectedTierResult(reason: string) {
  const payload = {
    status: "rejected",
    writeRejectedReason: reason,
    retry: "补齐当前完整 experiences 中缺失的 tier 后重新调用；education 和已标注 skills 的来源仍不传 tier",
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    details: payload,
  };
}

export function rejectedEducationCourseworkResult(reason: string) {
  const payload = {
    status: "rejected",
    writeRejectedReason: reason,
    retry: "重新读取全部 active 教育经历，只提交逐字存在于原文 sourceQuote 的课程名称",
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    details: payload,
  };
}

export function rejectedReselectionResult(
  workspace: ResumeWorkspace,
  reason: string,
) {
  const payload = { ...buildAgentWorkspaceView(workspace), writeRejectedReason: reason };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    details: {
      ...payload,
      loopGuardKey: resumeContentProgressKey(workspace),
      turnGovernorPhaseKey: "resume_generation",
    },
  };
}

export function createWorkspaceResult(
  workspace: NonNullable<ReturnType<ResumeWorkspaceStore["latest"]>>,
  selectionMode: "created" | "unchanged" | "reselected",
  newItemIds: readonly string[],
) {
  const workspaceView = buildAgentWorkspaceView(workspace) as {
    nextAction?: { mode?: string };
  };
  const payload = {
    ...workspaceView,
    sourceSelection: {
      mode: selectionMode,
      selectedExperienceCount: workspace.sourceSnapshot.experiences.length,
      newItemIds,
      nextWriteScope: selectionMode === "reselected" && newItemIds.length
        ? "write_all_new_items_only_then_compile"
        : "write_current_unwritten_items",
    },
    ...(selectionMode === "unchanged" ? {
      recovery: {
        repeated: true,
        instruction:
          "工作区与当前来源选择完全相同，禁止再次调用 create_resume_workspace；" +
          `立即执行当前 nextAction${workspaceView.nextAction?.mode
            ? `.mode=${workspaceView.nextAction.mode}` : ""}`,
      },
    } : {}),
    wholePageBudget: wholePageWritingBudget(workspace),
    ...buildAgentSourceView(workspace),
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    details: {
      ...payload,
      loopGuardKey: resumeContentProgressKey(workspace),
      turnGovernorPhaseKey: "resume_generation",
    },
  };
}
