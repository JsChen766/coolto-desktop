import type {
  ApplicationNote,
  ApplicationTrackerDetail,
  InterviewInput,
  InterviewRound,
  NoteInput,
  Reminder,
  ReminderInput,
  TrackerRecoveryProposal,
  TrackerSyncIssueSummary,
} from "../../../tracker/child-types.js";
import type {
  LocalResumeDraft,
  ResumeDraftCheckpoint,
  ResumeDraftSummary,
} from "../../../resume/draft/types.js";
import type { ResumeLibraryEntry } from "../../../resume/library/types.js";
import type { ResumeFull } from "../../../resume/types.js";
import type { JobRepositorySnapshot } from "../../../job-assets/repository-types.js";
import type {
  ApplicationCreateInput,
  ApplicationListOptions,
  ApplicationListResult,
  ApplicationRecord,
  ApplicationReferenceOptions,
  ApplicationTombstone,
  ApplicationWriteProposal,
} from "../../../tracker/types.js";
import type {
  ExperienceCreateInput,
  ExperienceDetail,
  ExperienceSearchOptions,
  ExperienceSearchResult,
} from "../../../api/types.js";
import type {
  ProfileContactUpdate,
  ProfileContactView,
  ProfileWriteProposal,
} from "../../../profile/types.js";
import type {
  ExperienceExecutionResult,
  ExperienceHistoryPage,
  ExperienceHistoryRequest,
  ExperiencePrepareRevisionRestoreRequest,
  ExperiencePrepareUpdateRequest,
  ExperienceSyncIssueView,
  ExperienceWriteProposal,
} from "../../../experience/maintenance-types.js";
import type { DesktopAgentEvent, DesktopApprovalRequest } from "./approvals.js";
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
  CheckoutPlan,
  CheckoutResult,
  CheckoutVerifyResult,
  ConversationDetail,
  ConversationRenameInput,
  ConversationSummary,
  DesktopAttachment,
  DesktopCreditSummary,
  DesktopUser,
  EmailChallengeView,
} from "./conversations.js";
import type {
  ApplicationTransitionRequest,
  ApplicationPrepareUpdateRequest,
  ApplicationUpdateRequest,
  LibraryArchiveInput,
  LibraryDeleteDraftInput,
  LibraryRenameInput,
  LibraryRestoreCheckpointInput,
  CloudResumePreview,
  ResumeDraftDetail,
  ResumeDraftEditInput,
  ResumeDraftExportPdfInput,
  ResumeDraftExportPdfResult,
  ResumeDraftRestoreInput,
  ResumeDraftSaveInput,
} from "./resume-library.js";
import type { AppUpdateState, UpdateTrigger } from "./updates.js";
import type { AgentTaskDesktopApi } from "./agent-tasks.js";
import type { MailConnectionsDesktopApi } from "./mail-connections.js";
import type { TrackerChildDesktopApi } from "./tracker-child-api.js";
export interface DesktopApi {
  platform: DesktopPlatform;
  auth: {
    getCurrentUser(): Promise<DesktopUser | undefined>;
    getCredits(): Promise<DesktopCreditSummary>;
    requestEmailCode(email: string): Promise<EmailChallengeView>;
    verifyEmailCode(email: string, challengeId: string, code: string): Promise<DesktopUser>;
    logout(): Promise<void>;
    syncNow(): Promise<void>;
    onSyncCompleted(listener: () => void): () => void;
  };
  checkout: {
    plans(): Promise<CheckoutPlan[]>;
    create(planType: string): Promise<CheckoutResult>;
    verify(checkoutId: string): Promise<CheckoutVerifyResult>;
  };
  shell: {
    openExternal(url: string): Promise<void>;
  };
  mailConnections: MailConnectionsDesktopApi;
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
    selectPath(conversationId: string, path: string): Promise<DesktopAttachment | undefined>;
    remove(input: AttachmentRemoveInput): Promise<void>;
  };
  /** 渲染层拖入文件时拿真实路径（webUtils.getPathForFile 的 preload 包装）。 */
  getPathForFile(file: File): string;
  resumeDrafts: {
    list(): Promise<ResumeDraftSummary[]>;
    get(artifactId: string): Promise<ResumeDraftDetail>;
    edit(input: ResumeDraftEditInput): Promise<ResumeDraftDetail>;
    restore(input: ResumeDraftRestoreInput): Promise<ResumeDraftDetail>;
    accept(artifactId: string): Promise<ResumeDraftDetail>;
    reject(artifactId: string): Promise<ResumeDraftDetail>;
    exportPdf(input: ResumeDraftExportPdfInput): Promise<ResumeDraftExportPdfResult>;
    save(input: ResumeDraftSaveInput): Promise<ResumeDraftDetail>;
  };
  updates: {
    getState(): Promise<AppUpdateState>;
    check(trigger: UpdateTrigger): Promise<void>;
    install(): Promise<void>;
    onStateChange(listener: (state: AppUpdateState) => void): () => void;
  };
  agent: {
    prompt(input: AgentPromptInput): Promise<ConversationDetail>;
    cancel(): Promise<void>;
    pendingApprovals(conversationId: string): Promise<DesktopApprovalRequest[]>;
    resolveApproval(input: ApprovalResolveInput): Promise<ConversationDetail>;
    onEvent(listener: (conversationId: string, event: DesktopAgentEvent) => void): () => void;
  };
  agentTasks: AgentTaskDesktopApi;
  library: {
    list(): Promise<ResumeLibraryEntry[]>;
    preview(resumeId: string): Promise<CloudResumePreview>;
    rename(input: LibraryRenameInput): Promise<ResumeFull>;
    archive(input: LibraryArchiveInput): Promise<ResumeFull>;
    deleteDraft(input: LibraryDeleteDraftInput): Promise<void>;
    getCheckpoints(artifactId: string): Promise<ResumeDraftCheckpoint[]>;
    restoreCheckpoint(input: LibraryRestoreCheckpointInput): Promise<LocalResumeDraft>;
  };
  jobAssets: {
    get(): Promise<JobRepositorySnapshot>;
  };
  experiences: {
    search(options?: ExperienceSearchOptions): Promise<ExperienceSearchResult>;
    get(experienceId: string): Promise<ExperienceDetail>;
    history(input: ExperienceHistoryRequest): Promise<ExperienceHistoryPage>;
    prepareCreate(input: ExperienceCreateInput): Promise<ExperienceWriteProposal>;
    prepareUpdate(input: ExperiencePrepareUpdateRequest): Promise<ExperienceWriteProposal>;
    prepareArchive(experienceId: string): Promise<ExperienceWriteProposal>;
    prepareRestore(experienceId: string): Promise<ExperienceWriteProposal>;
    prepareDelete(experienceId: string): Promise<ExperienceWriteProposal>;
    prepareRestoreRevision(
      input: ExperiencePrepareRevisionRestoreRequest,
    ): Promise<ExperienceWriteProposal>;
    syncIssue(experienceId: string): Promise<ExperienceSyncIssueView>;
    prepareAcceptServer(experienceId: string): Promise<ExperienceWriteProposal>;
    prepareReapply(experienceId: string): Promise<ExperienceWriteProposal>;
    prepareSaveAsNew(experienceId: string): Promise<ExperienceWriteProposal>;
    executeProposal(proposalId: string): Promise<ExperienceExecutionResult>;
  };
  profile: {
    get(): Promise<ProfileContactView>;
    prepareUpdate(changes: ProfileContactUpdate): Promise<ProfileWriteProposal>;
    prepareReapply(changes: ProfileContactUpdate): Promise<ProfileWriteProposal>;
    prepareAcceptServer(): Promise<ProfileWriteProposal>;
    executeProposal(proposalId: string): Promise<import("../../../api/types.js").UserProfile>;
  };
  applications: {
    list(options?: ApplicationListOptions): Promise<ApplicationListResult>;
    references(): Promise<ApplicationReferenceOptions>;
    get(applicationId: string): Promise<ApplicationRecord>;
    create(input: ApplicationCreateInput): Promise<ApplicationRecord>;
    prepareCreate(input: ApplicationCreateInput): Promise<ApplicationWriteProposal>;
    prepareUpdate(input: ApplicationPrepareUpdateRequest): Promise<ApplicationWriteProposal>;
    executeProposal(proposalId: string): Promise<ApplicationRecord>;
    update(input: ApplicationUpdateRequest): Promise<ApplicationRecord>;
    transition(input: ApplicationTransitionRequest): Promise<ApplicationRecord>;
    delete(applicationId: string): Promise<ApplicationTombstone>;
  };
  tracker: {
    detail(applicationId: string): Promise<ApplicationTrackerDetail>;
    overview(): Promise<ApplicationTrackerDetail>;
    syncIssues(): Promise<TrackerSyncIssueSummary[]>;
    prepareRecovery(input: {
      entityType: TrackerSyncIssueSummary["entityType"];
      entityId: string;
      action: TrackerRecoveryProposal["action"];
    }): Promise<TrackerRecoveryProposal>;
    executeRecovery(proposalId: string): Promise<void>;
    retryPending(): Promise<void>;
  };
  interviews: TrackerChildDesktopApi<InterviewRound, InterviewInput>;
  notes: TrackerChildDesktopApi<ApplicationNote, NoteInput>;
  reminders: TrackerChildDesktopApi<Reminder, ReminderInput>;
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    reportDraftSaveState(state: WindowDraftSaveState): Promise<void>;
    completeSaveBeforeClose(success: boolean): Promise<void>;
    onSaveBeforeClose(listener: () => void): () => void;
  };
  data: {
    clearLocal(): Promise<void>;
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
export type WindowDraftSaveState =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error";
