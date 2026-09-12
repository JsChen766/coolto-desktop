import type {
  DeletionStatus,
  DeletionStepView,
  PrivacyConsentView,
  PrivacyPolicyView,
} from "../../../privacy/types.js";

export interface PrivacyGateState {
  available: boolean;
  policy: PrivacyPolicyView | null;
  consent: PrivacyConsentView | null;
  localAccepted: boolean;
  error: string | null;
  restrictedRecovery?: boolean;
}

export interface PrivacyExportOptions {
  includeCloudAssets: boolean;
  includeConversations: boolean;
  includeDrafts: boolean;
  includeTasks: boolean;
  passphrase: string;
}

export interface PrivacyExportResult {
  status: "exported" | "cancelled";
  fileName: string | null;
  mode: "synchronized" | "local_pending" | "offline_stale" | null;
}
export interface LocalClearResultView {
  status: "cleared" | "partial_failure" | "blocked";
  cloudAssets: "preserved";
  cleared: string[];
  failed: Array<{ scope: string; code: string }>;
}

export interface PrivacyDeletionInput {
  accountEmail: string;
  confirmation: string;
}

export interface PrivacyDeletionState {
  status: DeletionStatus | "idle";
  requestId: string | null;
  retryable: boolean;
  steps: DeletionStepView[];
  thirdPartyDataUnaffected: true;
  message: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

export interface PrivacyDesktopApi {
  getState(): Promise<PrivacyGateState>;
  accept(): Promise<PrivacyGateState>;
  decline(): Promise<PrivacyGateState>;
  exportData(options: PrivacyExportOptions): Promise<PrivacyExportResult>;
  startDeletion(input: PrivacyDeletionInput): Promise<PrivacyDeletionState>;
  retryDeletion(): Promise<PrivacyDeletionState>;
  acknowledgeDeletion(): Promise<PrivacyDeletionState>;
  getDeletionState(): Promise<PrivacyDeletionState>;
  onStateChange(listener: (state: PrivacyGateState) => void): () => void;
  onDeletionStateChange(listener: (state: PrivacyDeletionState) => void): () => void;
}
