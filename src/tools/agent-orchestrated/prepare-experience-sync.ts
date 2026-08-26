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
      "兼容旧草稿的恢复工具。正常 add_resume_material 后宿主会自动展示经历仓库同步确认卡，不要重复调用；只有权威回执明确要求恢复确认卡时，才一次把所选经历的全部用户补充事实准备为更新确认。接受前不写入，原始 source snapshot 保持不变。",
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
