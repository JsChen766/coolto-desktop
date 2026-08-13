import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { ResumeCandidateReviewer } from "../../resume/quality/candidate-reviewer.js";
import { isBetterCandidate } from "../../resume/workspace/candidate-ranking.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { ResumeWorkspaceError } from "../../resume/workspace/errors.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { deriveWorkspaceStatus } from "../../resume/workspace/workspace-status.js";
import { buildModelPayload } from "../../resume/workspace/model-payload.js";
import { projectResumeWorkspace } from "../../resume/workspace/workspace-projection.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";

const parameters = Type.Object({}, {
  description: "无参数：查看当前草稿的最新编译结果与诊断。",
});

/**
 * Compile + diagnostics for the current draft. The host only measures and
 * reports (usage, violations, tail deficits with shortByChars, remaining
 * evidence); all content decisions and fixes are the agent's. Tail-short
 * bullets are listed in bulletTailDiagnostics with the exact deficit, and the
 * agent fixes them itself via patch_resume_candidate append_text.
 */
export function createInspectResumeDraftTool(
  compiler: ResumeCompiler,
  store: ResumeWorkspaceStore,
  reviewer?: ResumeCandidateReviewer,
): AgentTool<typeof parameters> {
  return {
    name: "inspect_resume_draft",
    label: "查看简历草稿",
    description:
      "对当前草稿执行一次真实 Chromium 编译，返回完整诊断（占用率、violations、尾行缺口 shortByChars、剩余证据、排版参数）。宿主只测量不写内容：尾行违规必须由你用 patch_resume_candidate 的 append_text 补齐。不需要也不允许为尾行做像素心算。",
    parameters,
    execute: async (_toolCallId, _params) => {
      const workspace = store.latest();
      if (!workspace) {
        throw new ResumeWorkspaceError(
          "candidate_not_found",
          "当前没有简历草稿，请先调用 prepare_resume_draft。",
        );
      }
      const compileResult = await compiler.compile(workspace.structure);
      let updated = workspace;
      if (compileResult !== workspace.compileResult) {
        const candidateSnapshot = {
          revision: workspace.revision,
          structure: workspace.structure,
          bindings: workspace.bindings,
          compileResult,
        };
        const bestSnapshot = isBetterCandidate(
          candidateSnapshot,
          workspace.bestSnapshot,
        )
          ? candidateSnapshot
          : workspace.bestSnapshot;
        updated = store.replace(
          {
            ...workspace,
            status: deriveWorkspaceStatus(compileResult, workspace.structure),
            compileResult,
            bestSnapshot,
          },
          workspace.revision,
        );
      }
      const reviewed = reviewQualified(updated, reviewer);
      const projection = projectResumeWorkspace(reviewed);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(buildModelPayload(reviewed)),
          },
        ],
        details: projection,
      };
    },
  };
}

function reviewQualified(
  workspace: ResumeWorkspace,
  reviewer: ResumeCandidateReviewer | undefined,
): ResumeWorkspace {
  if (!reviewer || workspace.status !== "layout_qualified") return workspace;
  return reviewer.review(workspace.candidateId, workspace.revision);
}
