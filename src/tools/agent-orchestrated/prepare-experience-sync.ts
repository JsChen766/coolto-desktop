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
      "用户明确同意后调用。一次把所选经历的用户补充事实准备为经历仓库更新确认卡；接受前不写入，原始 source snapshot 保持不变。",
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
      const ids = [...new Set(params.experienceIds.map((id) => id.trim()))];
      if (ids.length !== params.experienceIds.length) {
        throw new Error("experienceIds 含重复或空值");
      }
      const prepared = [];
      try {
        for (const id of ids) {
          const source = workspace.sourceSnapshot.experiences.find(
            (item) => item.id === id,
          );
          if (!source) throw new Error(`经历 ${id} 不在当前工作区`);
          const facts = (workspace.supplementalEvidence ?? [])
            .filter((item) => item.experienceId === id)
            .map((item) => item.text)
            .filter((fact) => !source.content.includes(fact));
          if (!facts.length) throw new Error(`经历 ${id} 没有待同步的补充事实`);
          const proposal = await proposals.prepareUpdate(id, {
            content: [source.content.trimEnd(), ...facts].join("\n"),
          });
          if (proposal.current?.content !== source.content) {
            proposals.discard(proposal.id);
            throw new Error(`经历 ${id} 已变化，请重新生成工作区后再同步`);
          }
          prepared.push(proposal);
        }
      } catch (error) {
        for (const proposal of prepared) proposals.discard(proposal.id);
        throw error;
      }
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
