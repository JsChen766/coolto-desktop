import type {
  ExperienceCategory,
  ExperienceDetail,
  ExperienceUpdateInput,
} from "../api/types.js";

export type ExperienceProposalKind =
  | "create"
  | "update"
  | "archive"
  | "restore"
  | "delete"
  | "accept_server"
  | "reapply"
  | "save_as_new";

export interface ExperienceProposalSnapshot {
  id: string;
  category: ExperienceCategory;
  title: string;
  content: string;
  organization: string | null;
  role: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  tags: string[];
  status: "active" | "archived";
  revisionId: string;
  revisionHash: string;
}

export interface ExperienceWriteProposal {
  id: string;
  kind: ExperienceProposalKind;
  experienceId: string;
  expectedEntityVersion: number | null;
  expectedLocalVersion: number | null;
  current: ExperienceProposalSnapshot | null;
  next: ExperienceProposalSnapshot | null;
  errorCode: string | null;
  preparedAt: string;
}

export interface ExperiencePrepareUpdateRequest {
  experienceId: string;
  changes: ExperienceUpdateInput;
}

export interface ExperienceSyncIssueView {
  experienceId: string;
  status: "conflict" | "failed";
  action: "create" | "update" | "delete" | "transition";
  errorCode: string;
  serverVersion: number;
  serverDeleted: boolean;
  local: ExperienceDetail;
  server: ExperienceDetail | null;
}

export interface ExperienceExecutionResult {
  experience: ExperienceDetail | null;
  removedLocal: boolean;
}
