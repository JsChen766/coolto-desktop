import type { ResumeContactFields } from "../resume/contracts/profile-contact.js";
import type { UserProfile } from "../api/types.js";
import type { CareerTargetV1 } from "./career-target-types.js";

export type ProfileContactUpdate = Partial<ResumeContactFields>;

export interface ProfileChangeSet extends ProfileContactUpdate {
  currentTitle?: string | null;
  currentCompany?: string | null;
  yearsOfExperience?: number | null;
  careerStage?: string | null;
  careerTargets?: CareerTargetV1[];
  preferredLanguage?: string;
  resumeStyle?: string | null;
}

export type ProfileSyncStatus = "clean" | "pending" | "conflict" | "failed";

export type UserProfileV2 = UserProfile & {
  careerTargets: CareerTargetV1[];
  entityVersion: number;
  updatedAt: string;
};

export interface ProfileSyncIssueView {
  status: Exclude<ProfileSyncStatus, "clean" | "pending">;
  action: string;
  serverVersion: number;
  serverOperation: "upsert" | "delete" | null;
  errorCode: string;
  localProfile: UserProfile;
  serverProfile: UserProfile | null;
}

export interface ProfileContactView extends UserProfile {
  syncStatus: ProfileSyncStatus;
  entityVersion?: number;
  syncIssue?: ProfileSyncIssueView;
}

export interface ProfileReaderV2 {
  getUserProfile(signal?: AbortSignal): Promise<UserProfileV2>;
  getProfileContext(signal?: AbortSignal): Promise<{
    profile: UserProfileV2;
    syncStatus: ProfileSyncStatus;
    entityVersion: number;
  }>;
}

export interface ProfileWriteProposal {
  id: string;
  kind: "manual" | "import" | "accept_server" | "reapply";
  current: UserProfile;
  next: UserProfile | null;
  syncStatus: ProfileSyncStatus;
  preparedAt: string;
}

export interface ProfileImportField {
  field: keyof ResumeContactFields;
  currentValue: string | null;
  proposedValue: string;
  selectedByDefault: boolean;
  confidence: "high" | "low";
}

export interface ProfileProposalExecutor {
  prepareImport(
    changes: ProfileChangeSet,
    expected: readonly ProfileImportField[],
  ): Promise<ProfileWriteProposal>;
  prepareUpdate(
    changes: ProfileChangeSet,
    kind?: "manual" | "import",
  ): Promise<ProfileWriteProposal>;
  prepareReapply(changes: ProfileChangeSet): Promise<ProfileWriteProposal>;
  prepareAcceptServer(): Promise<ProfileWriteProposal>;
  execute(proposalId: string): Promise<unknown>;
}
