import { createResumeMaterialRequest } from "./material-request.js";
import type { ResumeMaterialRequestKind } from "./material-request-types.js";
import type { ResumeWorkspace } from "./types.js";

/** Ends an authorized neutral closure without re-asking the user for facts. */
export function stopFactNeutralClosure(input: {
  workspace: ResumeWorkspace;
  kind: Extract<
    ResumeMaterialRequestKind,
    "page_fill_stalled" | "line_rewrite_stalled" | "tail_repair_stalled"
  >;
  reason: string;
}): ResumeWorkspace {
  const request = createResumeMaterialRequest(input.workspace, {
    kind: input.kind,
    reason: input.reason,
    question: "当前最好草稿已保留，但事实中性收尾未能安全达到交付门槛。",
    discoveryStage: "guidance",
  });
  return {
    ...input.workspace,
    status: "needs_user_decision",
    materialRequest: {
      ...request,
      status: "declined",
      resolution: "best_effort_stalled",
      respondedAt: new Date().toISOString(),
    },
  };
}
