import type {
  LocalResumeDraft,
  ResumeDraftArtifactReference,
} from "../../../resume/draft/types.js";
import type { ResumePublicationGateway } from
  "../../../resume/save/types.js";
import { localDraftContentHash } from
  "../../../resume/reuse/local-draft-source.js";
import { sha256, stableStringify } from
  "../../../resume/stable-snapshot.js";
import type { ResumeSourceSnapshotBuilder } from
  "../../../resume/source-snapshot.js";
import type { ResumeWorkspaceStatus } from
  "../../../resume/workspace/types.js";
import type { ResumeWorkspace } from
  "../../../resume/workspace/types.js";
import type { ResumeProfilePreferenceBinding } from
  "../../../resume/workspace/profile-preference-binding.js";
import type { ResumeWorkspaceStore } from
  "../../../resume/workspace/workspace-store.js";

const RESUMABLE_STATUSES = new Set<ResumeWorkspaceStatus>([
  "writing",
  "needs_revision",
  "layout_qualified",
  "needs_user_decision",
]);

export interface ResumeDraftReader {
  get(artifactId: string): Promise<Pick<LocalResumeDraft, "artifactId" | "workspace">>;
  getReusableDraft?(artifactId: string): Promise<LocalResumeDraft>;
}

export interface ResumeRestorationContext {
  workspaceStore: ResumeWorkspaceStore;
  artifactIdByCandidate: Map<string, string>;
  sourceBuilder?: ResumeSourceSnapshotBuilder;
  resumeReader?: Pick<ResumePublicationGateway, "getResume">;
  profilePreferenceContext?: () => Promise<ResumeProfilePreferenceBinding>;
}

export type ResumeRestorationReaders = Pick<
  ResumeRestorationContext,
  "sourceBuilder" | "resumeReader" | "profilePreferenceContext"
>;

const RESUME_RESTORE_DRIFT_ERROR =
  "当前简历引用已漂移，必须重新读取当前 JD、Experience、Resume 和 workspace";

export async function restoreLatestInProgressResume(
  artifacts: readonly ResumeDraftArtifactReference[],
  drafts: ResumeDraftReader,
  context: ResumeRestorationContext,
): Promise<boolean> {
  const reference = [...artifacts].reverse().find((artifact) =>
    artifact.workspaceStatus !== undefined &&
    RESUMABLE_STATUSES.has(artifact.workspaceStatus)
  );
  if (!reference) return false;
  const draft = await drafts.get(reference.artifactId);
  if (!await resumeWorkspaceIsCurrent(draft.workspace, drafts, context)) {
    return false;
  }
  context.workspaceStore.restore(draft.workspace);
  context.artifactIdByCandidate.set(
    draft.workspace.candidateId,
    draft.artifactId,
  );
  return true;
}

export async function resumeWorkspaceIsCurrent(
  workspace: ResumeWorkspace,
  drafts: ResumeDraftReader,
  readers: ResumeRestorationReaders,
): Promise<boolean> {
  return matchesCurrentResumeState(workspace, drafts, readers);
}

export async function assertResumeWorkspaceCurrent(
  workspace: ResumeWorkspace,
  drafts: ResumeDraftReader,
  readers: ResumeRestorationReaders,
): Promise<void> {
  if (!await resumeWorkspaceIsCurrent(workspace, drafts, readers)) {
    throw new Error(RESUME_RESTORE_DRIFT_ERROR);
  }
}

async function matchesCurrentResumeState(
  workspace: ResumeWorkspace,
  drafts: ResumeDraftReader,
  context: ResumeRestorationReaders,
): Promise<boolean> {
  const source = workspace.sourceSnapshot;
  if (hasRereadableSource(source)) {
    if (!context.sourceBuilder) return false;
    const experienceIds = source.experiences.map((experience) => experience.id);
    const current = source.jd
      ? await context.sourceBuilder.build({
          jdId: source.jd.id,
          experienceIds,
          template: source.template,
        })
      : await context.sourceBuilder.buildGeneral({
          experienceIds,
          template: source.template,
        });
    if (current.sourceFingerprint !== source.sourceFingerprint) return false;
  }
  if (!await matchesCurrentProfilePreference(workspace, context)) return false;
  return matchesCurrentResumeBase(workspace, drafts, context);
}

async function matchesCurrentProfilePreference(
  workspace: ResumeWorkspace,
  context: ResumeRestorationReaders,
): Promise<boolean> {
  const binding = workspace.profilePreferenceBinding;
  if (!binding) return true;
  if (!context.profilePreferenceContext) return false;
  const current = await context.profilePreferenceContext();
  if (current.profileLocalVersion !== undefined && binding.profileLocalVersion === undefined) {
    return false;
  }
  const localProfileChanged = binding.profileLocalVersion !== undefined &&
    current.profileLocalVersion !== binding.profileLocalVersion;
  return current.profileEntityVersion === binding.profileEntityVersion &&
    !localProfileChanged &&
    current.preferenceResolutionHash === binding.preferenceResolutionHash &&
    current.targetFingerprint === binding.targetFingerprint;
}

async function matchesCurrentResumeBase(
  workspace: ResumeWorkspace,
  drafts: ResumeDraftReader,
  context: ResumeRestorationReaders,
): Promise<boolean> {
  const base = workspace.reuseBase;
  if (!base) return true;
  if (base.kind === "composite") {
    return matchesCompositeResumeBase(base, drafts, context);
  }
  if ((base.kind ?? "cloud") === "cloud") {
    if (!context.resumeReader) return false;
    const current = await context.resumeReader.getResume(base.resumeId);
    return current.contentHash === base.contentHash;
  }
  if (!drafts.getReusableDraft) return false;
  const current = await drafts.getReusableDraft(base.resumeId);
  return localDraftContentHash(current) === base.contentHash;
}

async function matchesCompositeResumeBase(
  base: NonNullable<ResumeWorkspace["reuseBase"]>,
  drafts: ResumeDraftReader,
  context: ResumeRestorationReaders,
): Promise<boolean> {
  if (!base.sources?.length) return false;
  const currentSources: Array<Record<string, string>> = [];
  for (const source of base.sources) {
    const current = source.kind === "cloud"
      ? await readCloudResumeSource(source.sourceId, context)
      : await readLocalResumeSource(source.sourceId, drafts);
    if (!current) return false;
    currentSources.push({
      ...source,
      updatedAt: current.updatedAt,
      contentHash: current.contentHash,
    });
  }
  return sha256(stableStringify(currentSources)) === base.contentHash;
}

async function readCloudResumeSource(
  sourceId: string,
  context: ResumeRestorationReaders,
): Promise<{ contentHash: string; updatedAt: string } | undefined> {
  if (!context.resumeReader) return undefined;
  const resume = await context.resumeReader.getResume(sourceId);
  return { contentHash: resume.contentHash, updatedAt: resume.updatedAt };
}

async function readLocalResumeSource(
  sourceId: string,
  drafts: ResumeDraftReader,
): Promise<{ contentHash: string; updatedAt: string } | undefined> {
  if (!drafts.getReusableDraft) return undefined;
  const draft = await drafts.getReusableDraft(sourceId);
  return {
    contentHash: localDraftContentHash(draft),
    updatedAt: draft.updatedAt,
  };
}

function hasRereadableSource(
  source: ResumeWorkspace["sourceSnapshot"],
): boolean {
  return Boolean(
    source &&
    source.template &&
    Array.isArray(source.experiences) &&
    (!source.jd || typeof source.jd.id === "string"),
  );
}
