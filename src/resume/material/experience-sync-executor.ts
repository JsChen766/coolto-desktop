import type { ActionExecutor } from "../../approvals/executor-registry.js";
import type { ResumeExperienceSyncProposalPort } from "./experience-sync-port.js";
import { readExperienceSyncPayload } from "./experience-sync-approval.js";

export function createResumeExperienceSyncExecutor(
  proposals: ResumeExperienceSyncProposalPort,
): ActionExecutor {
  return {
    execute: async (context) => {
      const payload = readExperienceSyncPayload(context.payload);
      const results = payload.proposalIds.map((id) => proposals.execute(id));
      return {
        summary: `已将 ${results.length} 条经历更新加入本地同步队列`,
        details: { updatedCount: results.length },
      };
    },
    reject: (context) => {
      const payload = readExperienceSyncPayload(context.payload);
      for (const id of payload.proposalIds) proposals.discard(id);
    },
  };
}
