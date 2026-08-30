import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ApprovalManager } from "../../approvals/approval-manager.js";
import {
  createExperienceSyncApprovalDraft,
  createExperienceSyncPayload,
} from "../../resume/material/experience-sync-approval.js";
import type { ResumeExperienceSyncProposalPort } from "../../resume/material/experience-sync-port.js";
import { ResumeWorkspaceError } from "../../resume/workspace/errors.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { prepareExperienceSyncProposals } from
  "../../resume/material/experience-sync-preparer.js";

const parameters = Type.Object({
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
  experienceIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
});

export function createPrepareExperienceSyncTool(
  store: ResumeWorkspaceStore,
  proposals: ResumeExperienceSyncProposalPort,
  approvals: ApprovalManager,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_experience_sync",
    label: "准备同步补充经历",
    description:
      "仅兼容旧草稿中已经存在的历史审批，不用于新材料。正常 add_resume_material 后宿主会自动追加 Experience 纯文本正文，不再准备同步确认卡；除非权威回执明确要求恢复旧审批，否则禁止调用。",
    executionMode: "sequential",
    parameters,
    execute: async (_toolCallId, params) => {
      const workspace = store.get(params.candidateId);
      if (workspace.revision !== params.expectedRevision) {
        throw new ResumeWorkspaceError(
          "stale_candidate_revision",
          `Candidate revision changed from ${params.expectedRevision} to ${workspace.revision}.`,
        );
      }
      const prepared = await prepareExperienceSyncProposals(
        workspace,
        proposals,
        params.experienceIds,
      );
      const approval = await approvals.request(
        createExperienceSyncApprovalDraft(prepared),
        createExperienceSyncPayload(prepared),
      );
      const payload = {
        approvalRequestId: approval.id,
        experienceCount: prepared.length,
        instruction: "请等待用户通过程序确认卡接受、拒绝或提供修改意见。",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        details: payload,
      };
    },
  };
}
