import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { buildAgentSourceView } from "../../resume/workspace/agent-source-view.js";
import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import {
  buildAgentWorkspaceReceipt,
  buildAgentWorkspaceView,
} from "../../resume/workspace/agent-workspace-view.js";
import { ResumeWorkspaceError } from "../../resume/workspace/errors.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";

const parameters = Type.Object({});

export function createGetResumeWorkspaceTool(
  store: ResumeWorkspaceStore,
): AgentTool<typeof parameters> {
  let lastReturnedProgressKey: string | undefined;
  return {
    name: "get_resume_workspace",
    label: "读取简历工作区",
    description:
      "仅在上下文确实丢失时读取一次当前权威简历、真实布局测量、来源证据和待确认内容；恢复后必须直接执行 nextAction，不得连续调用。不重新编译、不修改 revision。",
    parameters,
    execute: async () => {
      const workspace = store.latest();
      if (!workspace) {
        throw new ResumeWorkspaceError(
          "candidate_not_found",
          "当前没有简历工作区，请先调用 create_resume_workspace。",
        );
      }
      const progressKey = resumeContentProgressKey(workspace);
      const repeated = progressKey === lastReturnedProgressKey;
      lastReturnedProgressKey = progressKey;
      const receipt = buildAgentWorkspaceReceipt(workspace) as {
        nextAction: object;
      } & Record<string, unknown>;
      const directive = recoveryDirective(
        workspace.revision,
        receipt.nextAction,
        repeated,
      );
      const payload = repeated
        ? { ...receipt, recovery: directive }
        : {
          ...buildAgentWorkspaceView(workspace),
          ...buildAgentSourceView(workspace),
          recovery: directive,
        };
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        details: {
          ...payload,
          loopGuardKey: progressKey,
          ...(actionMode(receipt.nextAction) === "batch_tail_repair"
            ? { turnGovernorPhaseKey: "resume_tail_repair" }
            : {}),
        },
      };
    },
  };
}

function recoveryDirective(
  revision: number,
  nextAction: object,
  repeated: boolean,
) {
  const mode = actionMode(nextAction);
  return {
    complete: true,
    repeated,
    instruction: mode === "stop"
      ? "恢复已完成；当前 nextAction.mode=stop，立即停止工具循环"
      : `恢复已完成；禁止再次调用 get_resume_workspace。立即使用 expectedRevision=${revision} 严格执行 nextAction.mode=${mode}`,
  };
}

function actionMode(nextAction: object): string {
  return "mode" in nextAction
    ? String((nextAction as { mode: unknown }).mode)
    : "unknown";
}
