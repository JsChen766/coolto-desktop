import type { ApprovalDraft } from "../../approvals/types.js";
import type { ExperienceWriteProposal } from "../../experience/maintenance-types.js";

export const RESUME_EXPERIENCE_SYNC_ACTION_TYPE =
  "resume.experience.sync";

export interface ResumeExperienceSyncPayload {
  proposalIds: string[];
}

export function createExperienceSyncApprovalDraft(
  proposals: readonly ExperienceWriteProposal[],
): ApprovalDraft {
  return {
    actionType: RESUME_EXPERIENCE_SYNC_ACTION_TYPE,
    scopeKey: "resume-experience-sync",
    risk: "write",
    title: "把补充内容保存到经历仓库",
    description:
      "接受后会把本轮用户补充事实追加到对应经历，并加入本地同步队列。",
    preview: {
      summary: [{ label: "待更新经历", value: `${proposals.length} 条` }],
      items: proposals.map((proposal) => ({
        id: proposal.experienceId,
        title: proposal.current?.title ?? proposal.experienceId,
        description: addedText(proposal),
      })),
    },
  };
}

export function createExperienceSyncPayload(
  proposals: readonly ExperienceWriteProposal[],
): ResumeExperienceSyncPayload {
  return { proposalIds: proposals.map((proposal) => proposal.id) };
}

export function readExperienceSyncPayload(
  payload: unknown,
): ResumeExperienceSyncPayload {
  if (!payload || typeof payload !== "object") throw new Error("经历同步审批无效");
  const ids = (payload as { proposalIds?: unknown }).proposalIds;
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== "string")) {
    throw new Error("经历同步审批 Payload 无效");
  }
  return { proposalIds: [...ids] };
}

function addedText(proposal: ExperienceWriteProposal): string {
  const before = proposal.current?.content ?? "";
  const after = proposal.next?.content ?? "";
  return after.startsWith(before) ? after.slice(before.length).trim() : after;
}
