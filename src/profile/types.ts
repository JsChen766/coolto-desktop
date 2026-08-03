import type { ResumeContactField, ResumeContactFields } from "../resume/contracts/profile-contact.js";

export type ProfileContactUpdate = Partial<ResumeContactFields>;

export interface ProfileWriteProposal {
  id: string;
  kind: "manual" | "import" | "accept_server" | "reapply";
  current: ResumeContactFields;
  next: ResumeContactFields | null;
  syncStatus: "clean" | "pending" | "conflict" | "failed";
  preparedAt: string;
}

export interface ProfileImportField {
  field: ResumeContactField;
  currentValue: string | null;
  proposedValue: string;
  selectedByDefault: boolean;
  confidence: "high" | "low";
}

export interface ProfileProposalExecutor {
  prepareImport(
    changes: ProfileContactUpdate,
    expected: readonly ProfileImportField[],
  ): Promise<ProfileWriteProposal>;
  execute(proposalId: string): Promise<unknown>;
}
