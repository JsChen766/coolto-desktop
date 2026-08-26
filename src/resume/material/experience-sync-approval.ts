import type { ApprovalDraft } from "../../approvals/types.js";
import type { ExperienceWriteProposal } from "../../experience/maintenance-types.js";

export const RESUME_EXPERIENCE_SYNC_ACTION_TYPE =
  "resume.experience.sync";

export interface ResumeExperienceSyncPayload {
  proposalIds: string[];
  artifactId?: string;
  evidenceFingerprint?: string;
}

export function createExperienceSyncApprovalDraft(
  proposals: readonly ExperienceWriteProposal[],
): ApprovalDraft {
  return {
    actionType: RESUME_EXPERIENCE_SYNC_ACTION_TYPE,
    scopeKey: "resume-experience-sync",
    risk: "write",
    title: "将补充事实同步到经历仓库",
    description:
      "经历仓库会保留本轮材料中全部可核验事实，当前简历只选择与岗位和版面最相关的部分。接受后会把以下事实追加到对应经历并加入本地同步队列；拒绝则只保留在当前简历草稿中。",
    preview: {
      summary: [
        { label: "待更新经历", value: `${proposals.length} 条` },
        { label: "保存范围", value: "本轮全部可核验事实" },
      ],
      items: proposals.map((proposal) => ({
        title: proposal.current?.title ?? proposal.experienceId,
        description: addedText(proposal),
      })),
    },
  };
}

export function createExperienceSyncPayload(
  proposals: readonly ExperienceWriteProposal[],
  context?: { artifactId: string; evidenceFingerprint: string },
): ResumeExperienceSyncPayload {
  return {
    proposalIds: proposals.map((proposal) => proposal.id),
    ...(context ? context : {}),
  };
}

export function readExperienceSyncPayload(
  payload: unknown,
): ResumeExperienceSyncPayload {
  if (!payload || typeof payload !== "object") throw new Error("经历同步审批无效");
  const ids = (payload as { proposalIds?: unknown }).proposalIds;
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== "string")) {
    throw new Error("经历同步审批 Payload 无效");
  }
  const source = payload as {
    artifactId?: unknown;
    evidenceFingerprint?: unknown;
  };
  const artifactId = typeof source.artifactId === "string"
    ? source.artifactId : undefined;
  const evidenceFingerprint = typeof source.evidenceFingerprint === "string"
    ? source.evidenceFingerprint : undefined;
  if (Boolean(artifactId) !== Boolean(evidenceFingerprint)) {
    throw new Error("经历同步审批的草稿来源无效");
  }
  return {
    proposalIds: [...ids],
    ...(artifactId && evidenceFingerprint
      ? { artifactId, evidenceFingerprint }
      : {}),
  };
}

function addedText(proposal: ExperienceWriteProposal): string {
  const before = proposal.current?.content ?? "";
  const after = proposal.next?.content ?? "";
  return after.startsWith(before) ? after.slice(before.length).trim() : after;
}
