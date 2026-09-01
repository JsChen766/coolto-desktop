import type { ActionExecutor } from "../../approvals/executor-registry.js";
import type {
  ResumeExperienceSyncDraftPort,
  ResumeExperienceSyncProposalPort,
} from "./experience-sync-port.js";
import { readExperienceSyncPayload } from "./experience-sync-approval.js";

export function createResumeExperienceSyncExecutor(
  proposals: ResumeExperienceSyncProposalPort,
  drafts?: ResumeExperienceSyncDraftPort,
): ActionExecutor {
  return {
    execute: async (context) => {
      const payload = readExperienceSyncPayload(context.payload);
      const results = proposals.executeMany
        ? proposals.executeMany(payload.proposalIds)
        : payload.proposalIds.map((id) => proposals.execute(id));
      if (drafts && payload.artifactId && payload.evidenceFingerprint) {
        await drafts.markExperienceSync(payload.artifactId, {
          evidenceFingerprint: payload.evidenceFingerprint,
          status: "accepted",
          updatedAt: new Date().toISOString(),
        });
      }
      return {
        summary: `已将 ${results.length} 条经历更新加入本地同步队列`,
        details: { updatedCount: results.length },
      };
    },
    reject: async (context) => {
      const payload = readExperienceSyncPayload(context.payload);
      for (const id of payload.proposalIds) proposals.discard(id);
      if (drafts && payload.artifactId && payload.evidenceFingerprint) {
        await drafts.markExperienceSync(payload.artifactId, {
          evidenceFingerprint: payload.evidenceFingerprint,
          status: "rejected",
          updatedAt: new Date().toISOString(),
        });
      }
    },
  };
}
