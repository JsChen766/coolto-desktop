import type {
  ExperienceCreateInput,
  ExperienceUpdateInput,
} from "../../api/types.js";
import type { ExperienceWriteProposal } from "../../experience/maintenance-types.js";
import type { LocalResumeDraft } from "../draft/types.js";

export interface ResumeExperienceSyncProposalPort {
  prepareCreate?(input: ExperienceCreateInput): Promise<ExperienceWriteProposal>;
  prepareUpdate(
    experienceId: string,
    changes: ExperienceUpdateInput,
  ): Promise<ExperienceWriteProposal>;
  execute(proposalId: string): unknown;
  executeMany?(proposalIds: readonly string[]): unknown[];
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
