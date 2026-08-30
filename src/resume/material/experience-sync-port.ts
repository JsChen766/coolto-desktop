import type { ExperienceWriteProposal } from "../../experience/maintenance-types.js";
import type { LocalResumeDraft } from "../draft/types.js";

export interface ResumeExperienceSyncProposalPort {
  prepareUpdate(
    experienceId: string,
    changes: { content: string },
  ): Promise<ExperienceWriteProposal>;
  execute(proposalId: string): unknown;
  discard(proposalId: string): void;
}

export interface ResumeExperienceSyncDraftPort {
  markExperienceSync(
    artifactId: string,
    state: {
      evidenceFingerprint: string;
      status: "pending_approval" | "accepted" | "rejected" | "stale";
      approvalRequestId?: string;
      updatedAt: string;
    },
  ): Promise<LocalResumeDraft>;
}
