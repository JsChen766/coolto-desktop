import type { ExperienceWriteProposal } from "../../experience/maintenance-types.js";

export interface ResumeExperienceSyncProposalPort {
  prepareUpdate(
    experienceId: string,
    changes: { content: string },
  ): Promise<ExperienceWriteProposal>;
  execute(proposalId: string): unknown;
  discard(proposalId: string): void;
}
