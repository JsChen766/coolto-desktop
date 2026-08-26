import type {
  LocalResumeDraft,
  ResumeDraftArtifactReference,
} from "../../../resume/draft/types.js";
import type { ResumeWorkspaceStatus } from
  "../../../resume/workspace/types.js";
import type { ResumeWorkspaceStore } from
  "../../../resume/workspace/workspace-store.js";

const RESUMABLE_STATUSES = new Set<ResumeWorkspaceStatus>([
  "writing",
  "needs_revision",
  "layout_qualified",
  "needs_user_decision",
]);

interface DraftReader {
  get(artifactId: string): Promise<Pick<LocalResumeDraft, "artifactId" | "workspace">>;
}

interface ResumeRestorationContext {
  workspaceStore: ResumeWorkspaceStore;
  artifactIdByCandidate: Map<string, string>;
}

export async function restoreLatestInProgressResume(
  artifacts: readonly ResumeDraftArtifactReference[],
  drafts: DraftReader,
  context: ResumeRestorationContext,
): Promise<boolean> {
  const reference = [...artifacts].reverse().find((artifact) =>
    artifact.workspaceStatus !== undefined &&
    RESUMABLE_STATUSES.has(artifact.workspaceStatus)
  );
  if (!reference) return false;
  const draft = await drafts.get(reference.artifactId);
  context.workspaceStore.restore(draft.workspace);
  context.artifactIdByCandidate.set(
    draft.workspace.candidateId,
    draft.artifactId,
  );
  return true;
}
