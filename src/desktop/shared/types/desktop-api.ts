import type {
  LocalResumeDraft,
  ResumeDraftCheckpoint,
  ResumeDraftSummary,
} from "../../../resume/draft/types.js";
import type { ResumeLibraryEntry } from "../../../resume/library/types.js";
import type { ResumeFull } from "../../../resume/types.js";
import type {
  ApplicationCreateInput,
  ApplicationListOptions,
  ApplicationListResult,
  ApplicationRecord,
  ApplicationReferenceOptions,
  ApplicationTombstone,
} from "../../../tracker/types.js";
import type { DesktopAgentEvent } from "./approvals.js";
import type {
  BrowserFillRecordView,
  BrowserNavigateInput,
  BrowserOpenInput,
  BrowserState,
  DesktopPlatform,
} from "./browser.js";
import type {
  AgentPromptInput,
  ApprovalResolveInput,
  AttachmentRemoveInput,
  ConversationDetail,
  ConversationRenameInput,
  ConversationSummary,
  DesktopAttachment,
  DesktopUser,
  EmailChallengeView,
} from "./conversations.js";
import type {
  ApplicationTransitionRequest,
  ApplicationUpdateRequest,
  LibraryArchiveInput,
  LibraryDeleteDraftInput,
  LibraryRenameInput,
  LibraryRestoreCheckpointInput,
  ResumeDraftDetail,
  ResumeDraftEditInput,
  ResumeDraftRestoreInput,
} from "./resume-library.js";

export interface DesktopApi {
  platform: DesktopPlatform;
  auth: {
    getCurrentUser(): Promise<DesktopUser | undefined>;
    login(email: string, password: string): Promise<DesktopUser>;
    requestEmailCode(email: string): Promise<EmailChallengeView>;
    verifyEmailCode(email: string, challengeId: string, code: string): Promise<DesktopUser>;
    logout(): Promise<void>;
  };
  conversations: {
    list(): Promise<ConversationSummary[]>;
    create(): Promise<ConversationDetail>;
    get(conversationId: string): Promise<ConversationDetail>;
    rename(input: ConversationRenameInput): Promise<ConversationSummary>;
    delete(conversationId: string): Promise<void>;
  };
  attachments: {
    list(conversationId: string): Promise<DesktopAttachment[]>;
    select(conversationId: string): Promise<DesktopAttachment | undefined>;
    remove(input: AttachmentRemoveInput): Promise<void>;
  };
  resumeDrafts: {
    list(): Promise<ResumeDraftSummary[]>;
    get(artifactId: string): Promise<ResumeDraftDetail>;
    edit(input: ResumeDraftEditInput): Promise<ResumeDraftDetail>;
    restore(input: ResumeDraftRestoreInput): Promise<ResumeDraftDetail>;
    accept(artifactId: string): Promise<ResumeDraftDetail>;
    reject(artifactId: string): Promise<ResumeDraftDetail>;
  };
  agent: {
    prompt(input: AgentPromptInput): Promise<ConversationDetail>;
    cancel(): Promise<void>;
    resolveApproval(input: ApprovalResolveInput): Promise<ConversationDetail>;
    onEvent(listener: (conversationId: string, event: DesktopAgentEvent) => void): () => void;
  };
  library: {
    list(): Promise<ResumeLibraryEntry[]>;
    rename(input: LibraryRenameInput): Promise<ResumeFull>;
    archive(input: LibraryArchiveInput): Promise<ResumeFull>;
    deleteDraft(input: LibraryDeleteDraftInput): Promise<void>;
    getCheckpoints(artifactId: string): Promise<ResumeDraftCheckpoint[]>;
    restoreCheckpoint(input: LibraryRestoreCheckpointInput): Promise<LocalResumeDraft>;
  };
  applications: {
    list(options?: ApplicationListOptions): Promise<ApplicationListResult>;
    references(): Promise<ApplicationReferenceOptions>;
    get(applicationId: string): Promise<ApplicationRecord>;
    create(input: ApplicationCreateInput): Promise<ApplicationRecord>;
    update(input: ApplicationUpdateRequest): Promise<ApplicationRecord>;
    transition(input: ApplicationTransitionRequest): Promise<ApplicationRecord>;
    delete(applicationId: string): Promise<ApplicationTombstone>;
  };
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
  };
  browser: {
    open(input?: BrowserOpenInput): Promise<BrowserState>;
    close(): Promise<void>;
    navigate(input: BrowserNavigateInput): Promise<void>;
    goBack(): Promise<void>;
    goForward(): Promise<void>;
    reload(): Promise<void>;
    getState(): Promise<BrowserState>;
    abortFill(): Promise<void>;
    onStateChanged(listener: (state: BrowserState) => void): () => void;
    onFillProgress(listener: (payload: { records: BrowserFillRecordView[]; reviewing: boolean }) => void): () => void;
    onReviewDecision(listener: (payload: { fillId: string; decision: "accepted" | "rejected" }) => void): () => void;
    onReviewComplete(listener: (payload: { action: "accepted" | "rejected" | "mixed"; acceptedCount: number; rejectedCount: number }) => void): () => void;
    onCaptchaDetected(listener: (payload: { kind: "recaptcha" | "hcaptcha" | "geetest" | "slider" | "image" | "unknown"; detail?: string }) => void): () => void;
  };
}
