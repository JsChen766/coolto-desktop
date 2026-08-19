import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { buildAgentSourceView } from "../../resume/workspace/agent-source-view.js";
import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import { buildAgentWorkspaceView } from "../../resume/workspace/agent-workspace-view.js";
import { ResumeWorkspaceError } from "../../resume/workspace/errors.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";

const parameters = Type.Object({});

export function createGetResumeWorkspaceTool(
  store: ResumeWorkspaceStore,
): AgentTool<typeof parameters> {
  return {
    name: "get_resume_workspace",
    label: "读取简历工作区",
    description:
      "读取当前权威简历、真实布局测量、来源证据和待确认内容。用于恢复上下文；不重新编译、不修改 revision。",
    parameters,
    execute: async () => {
      const workspace = store.latest();
      if (!workspace) {
        throw new ResumeWorkspaceError(
          "candidate_not_found",
          "当前没有简历工作区，请先调用 create_resume_workspace。",
        );
      }
      const payload = {
        ...buildAgentWorkspaceView(workspace),
        ...buildAgentSourceView(workspace),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        details: {
          ...payload,
          loopGuardKey: resumeContentProgressKey(workspace),
        },
      };
    },
  };
}
