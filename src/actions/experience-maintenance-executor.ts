import type { ActionExecutor } from "../approvals/executor-registry.js";
import type { ResumeExperienceSyncProposalPort } from
  "../resume/material/experience-sync-port.js";
import { readExperienceMaintenancePayload } from
  "../experience/maintenance-approval.js";

export function createExperienceMaintenanceExecutor(
  proposals: ResumeExperienceSyncProposalPort,
): ActionExecutor {
  return {
    execute: async (context) => {
      const payload = readExperienceMaintenancePayload(context.payload);
      const results = proposals.executeMany
        ? proposals.executeMany(payload.proposalIds)
        : payload.proposalIds.map((id) => proposals.execute(id));
      return {
        summary: `已将 ${results.length} 条经历修正加入本地同步队列`,
        details: { changedCount: results.length },
      };
    },
    reject: async (context) => {
      const payload = readExperienceMaintenancePayload(context.payload);
      payload.proposalIds.forEach((id) => proposals.discard(id));
    },
  };
}
