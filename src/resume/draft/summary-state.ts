import { resumeGenerationReadiness } from
  "../workspace/generation-readiness.js";
import type {
  ResumeWorkspace,
  ResumeWorkspaceStatus,
} from "../workspace/types.js";

const STATUSES: readonly ResumeWorkspaceStatus[] = [
  "writing",
  "needs_revision",
  "layout_qualified",
  "ready_for_approval",
  "needs_user_decision",
];

/** Projects legacy drafts without inventing a JD or treating incomplete data as ready. */
export function resumeDraftSummaryState(workspace: ResumeWorkspace) {
  const value = workspace as Partial<ResumeWorkspace>;
  const status = STATUSES.includes(value.status as ResumeWorkspaceStatus)
    ? value.status as ResumeWorkspaceStatus
    : "needs_revision";
  let generationReady = false;
  try {
    generationReady = resumeGenerationReadiness(workspace).ready;
  } catch {
    generationReady = false;
  }
  const jd = value.sourceSnapshot?.jd;
  return {
    workspaceStatus: status,
    generationReady,
    jdId: typeof jd?.id === "string" && jd.id ? jd.id : null,
    jdTitle: typeof jd?.title === "string" && jd.title ? jd.title : null,
  };
}
