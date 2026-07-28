import { randomUUID } from "node:crypto";

import type { ResumeWorkspace } from "../workspace/types.js";
import type {
  LocalResumeDraft,
  ResumeDraftCheckpoint,
  ResumeDraftCheckpointReason,
  ResumeDraftSummary,
} from "./types.js";

export function createLocalResumeDraft(input: {
  ownerId: string;
  conversationId: string;
  workspace: ResumeWorkspace;
  now?: string;
  artifactId?: string;
}): LocalResumeDraft {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: "local-resume-draft-v1",
    artifactId: input.artifactId ?? randomUUID(),
    ownerId: input.ownerId,
    conversationIds: [input.conversationId],
    title: draftTitle(input.workspace),
    createdAt: now,
    updatedAt: now,
    workspace: structuredClone(input.workspace),
    checkpoints: [],
    pendingChange: null,
    cloudLink: null,
  };
}

export function updateDraftWorkspace(
  source: LocalResumeDraft,
  conversationId: string,
  workspace: ResumeWorkspace,
  now = new Date().toISOString(),
): LocalResumeDraft {
  const conversationIds = source.conversationIds.includes(conversationId)
    ? source.conversationIds
    : [...source.conversationIds, conversationId];
  return {
    ...structuredClone(source),
    conversationIds,
    title: draftTitle(workspace),
    updatedAt: now,
    workspace: structuredClone(workspace),
  };
}

export function appendDraftCheckpoint(
  source: LocalResumeDraft,
  reason: ResumeDraftCheckpointReason,
  label: string,
  now = new Date().toISOString(),
): LocalResumeDraft {
  const checkpoint: ResumeDraftCheckpoint = {
    id: randomUUID(),
    label: label.trim() || defaultCheckpointLabel(reason),
    reason,
    createdAt: now,
    workspace: structuredClone(source.workspace),
  };
  return {
    ...structuredClone(source),
    updatedAt: now,
    checkpoints: [...source.checkpoints, checkpoint],
  };
}

export function summarizeDraft(draft: LocalResumeDraft): ResumeDraftSummary {
  const syncedRevision = draft.cloudLink?.syncedRevision;
  return {
    artifactId: draft.artifactId,
    title: draft.title,
    conversationIds: [...draft.conversationIds],
    updatedAt: draft.updatedAt,
    checkpointCount: draft.checkpoints.length,
    hasPendingChange: draft.pendingChange !== null,
    cloudState:
      syncedRevision === undefined
        ? "local_only"
        : syncedRevision === draft.workspace.revision
          ? "synced"
          : "local_changes",
    cloudResumeId: draft.cloudLink?.resumeId ?? null,
  };
}

function draftTitle(workspace: ResumeWorkspace): string {
  const role = workspace.sourceSnapshot.jd.targetRole?.trim();
  const jdTitle = workspace.sourceSnapshot.jd.title.trim();
  return role || jdTitle || "未命名简历";
}

function defaultCheckpointLabel(reason: ResumeDraftCheckpointReason): string {
  if (reason === "generated") return "完成生成";
  if (reason === "manual_edit") return "手动修改";
  if (reason === "ai_change_accepted") return "接受 AI 修改";
  return "恢复历史版本";
}
