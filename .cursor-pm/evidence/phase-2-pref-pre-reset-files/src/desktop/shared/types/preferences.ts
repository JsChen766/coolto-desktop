import type {
  PreferenceListFilterV1,
  PreferenceMutationInputV1,
  PreferenceResolutionV1,
  PreferenceSuggestionV1,
  PreferenceTurnOverrideV1,
  PreferenceV1,
  PreferenceWriteProposalV1,
} from "../../../preference/types.js";

export type {
  PreferenceResolutionV1,
  PreferenceSuggestionV1,
  PreferenceWriteProposalV1,
} from "../../../preference/types.js";

export interface PreferenceSyncIssueView {
  status: "conflict" | "failed";
  errorCode: string;
  serverVersion: number;
  serverOperation: "upsert" | "delete" | null;
  serverPreference: PreferenceV1 | null;
  localPreference: PreferenceV1 | null;
}

export interface PreferenceDesktopView extends PreferenceV1 {
  syncStatus: "clean" | "pending" | "conflict" | "failed";
  localUsage: { useCount: number; lastUsedAt: string | null } | null;
  syncIssue?: PreferenceSyncIssueView;
}

export interface PreferenceResolveInput {
  sessionId?: string;
  turnId?: string;
  actionId?: string;
  taskScope?: "global" | "resume" | "job_search" | "browser_fill" | "interview";
  targetFingerprint?: string | null;
  domain?: string | null;
  currentOverrides?: PreferenceTurnOverrideV1[];
}

export interface PreferenceDesktopApi {
  list(filter?: PreferenceListFilterV1): Promise<PreferenceDesktopView[]>;
  get(id: string): Promise<PreferenceDesktopView | null>;
  prepareCreate(input: PreferenceMutationInputV1): Promise<PreferenceWriteProposalV1>;
  prepareCreateFromSuggestion(input: PreferenceMutationInputV1, suggestionId: string): Promise<PreferenceWriteProposalV1>;
  prepareUpdate(id: string, input: Partial<PreferenceMutationInputV1>): Promise<PreferenceWriteProposalV1>;
  prepareDisable(id: string): Promise<PreferenceWriteProposalV1>;
  prepareEnable(id: string): Promise<PreferenceWriteProposalV1>;
  prepareDelete(id: string): Promise<PreferenceWriteProposalV1>;
  prepareAcceptServer(id: string): Promise<PreferenceWriteProposalV1>;
  prepareReapply(id: string): Promise<PreferenceWriteProposalV1>;
  executeProposal(id: string): Promise<PreferenceV1 | null>;
  resolve(input?: PreferenceResolveInput): Promise<PreferenceResolutionV1>;
  suggestions: {
    list(): Promise<PreferenceSuggestionV1[]>;
    reject(id: string): Promise<void>;
    clearSuppressed(): Promise<void>;
  };
}
