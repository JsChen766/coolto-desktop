import type { ResumeCompileResult } from "../../resume/compiler-types.js";
export type {
  MatchDimensionScore,
  MatchGap,
  MatchHighlight,
} from "../../match/types.js";
import type {
  MatchDimensionScore,
  MatchGap,
  MatchHighlight,
} from "../../match/types.js";
export type { ResumeDraftCheckpoint } from "../../resume/draft/types.js";
import type {
  LocalResumeDraft,
  ResumeDraftArtifactReference,
  ResumeDraftCheckpoint,
  ResumeDraftSummary,
} from "../../resume/draft/types.js";
import type { ResumeFull, ResumeStructure } from "../../resume/types.js";
export type {
  ResumeLibraryEntry,
  ResumeLibrarySyncStatus,
  ResumeLibraryOperation,
} from "../../resume/library/types.js";
import type { ResumeLibraryEntry } from "../../resume/library/types.js";

export type MatchReportTier = "excellent" | "good" | "moderate" | "weak";

export interface MatchReportArtifactData {
  reportId: string;
  jdId: string;
  jdTitle: string;
  jdCompany: string | null;
  finalScore: number;
  tier: MatchReportTier;
  dimensions: MatchDimensionScore[];
  highlights: MatchHighlight[];
  gaps: MatchGap[];
  coverageRatio: number;
  evidenceCompleteness: number;
  generatedAt: string;
  expired: boolean;
}

export interface JdArtifactRequirement {
  text: string;
  category: string;
  importance: string;
}

export interface JdArtifactData {
  proposalId: string;
  approvalRequestId: string;
  title: string;
  company: string | null;
  targetRole: string | null;
  requirements: JdArtifactRequirement[];
  status: "pending" | "saved" | "rejected";
  jdId?: string;
}
import type { ResumeWorkspaceStatus } from "../../resume/workspace/types.js";

export type ChatRole = "user" | "assistant";

export interface DesktopUser {
  id: string;
  email: string;
}

export interface EmailChallengeView {
  challengeId: string;
  expiresAt: string;
  retryAfterSeconds: number;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
  resumeArtifacts: ResumeDraftArtifactReference[];
}

export interface DesktopAttachment {
  id: string;
  filename: string;
  type: "pdf" | "docx" | "text" | "markdown";
  sizeBytes: number;
}

export interface AttachmentRemoveInput {
  conversationId: string;
  fileId: string;
}

export interface ResumeDraftCheckpointView {
  id: string;
  label: string;
  reason: string;
  createdAt: string;
  revision: number;
}

export interface ResumeDraftQualityView {
  pageUsageRatio: number;
  minimumBulletTailRatio: number | null;
  factIntegrity: "passed" | "needs_review" | "failed";
  jdCoverage: {
    covered: number;
    total: number;
    ratio: number;
  } | null;
}

export interface ResumeDraftDetail extends ResumeDraftSummary {
  structure: ResumeStructure;
  compileResult: ResumeCompileResult;
  workspaceStatus: ResumeWorkspaceStatus;
  quality: ResumeDraftQualityView;
  checkpoints: ResumeDraftCheckpointView[];
  pendingChange: {
    id: string;
    summary: string;
    changedBulletIds: string[];
    createdAt: string;
  } | null;
}

export interface ResumeDraftEditInput {
  artifactId: string;
  target:
    | { type: "bullet"; bulletId: string }
    | { type: "raw_text"; itemId: string };
  text: string;
  createCheckpoint?: boolean;
}

export interface ResumeDraftRestoreInput {
  artifactId: string;
  checkpointId: string;
}

export interface LibraryRenameInput {
  resumeId: string;
  title: string;
}

export interface LibraryArchiveInput {
  resumeId: string;
  archive: boolean;
}

export interface LibraryDeleteDraftInput {
  artifactId: string;
}

export interface LibraryRestoreCheckpointInput {
  artifactId: string;
  checkpointId: string;
}

export interface ApprovalPreviewField {
  label: string;
  value: string;
}

export interface ApprovalPreviewItem {
  title: string;
  description?: string;
  fields?: ApprovalPreviewField[];
  warning?: string;
}

export interface DesktopApprovalRequest {
  id: string;
  actionType: string;
  risk: "write" | "sensitive" | "destructive" | "external";
  title: string;
  description: string;
  preview: {
    summary: ApprovalPreviewField[];
    items?: ApprovalPreviewItem[];
    warnings?: string[];
  };
  createdAt: string;
}

export type DesktopApprovalDecision =
  | { type: "accept" }
  | { type: "reject" }
  | { type: "custom"; text: string };

export type DesktopAgentEvent =
  | { type: "run.started" }
  | { type: "message.delta"; text: string }
  | {
      type: "tool.started";
      callId: string;
      name: string;
      arguments: unknown;
    }
  | {
      type: "tool.completed";
      callId: string;
      name: string;
      isError: boolean;
    }
  | { type: "run.failed"; message: string }
  | { type: "run.completed" }
  | { type: "resume.draft.updated"; artifactId: string }
  | { type: "approval.required"; request: DesktopApprovalRequest }
  | {
      type: "approval.resolved";
      requestId: string;
      decision: "accept" | "reject" | "custom" | "replaced";
    }
  | { type: "approval.executing"; requestId: string }
  | {
      type: "approval.completed";
      requestId: string;
      summary: string;
      details?: unknown;
    }
  | {
      type: "approval.failed";
      requestId: string;
      message: string;
    }
  | { type: "jd.proposal.created"; data: JdArtifactData }
  | { type: "match.report.created"; data: MatchReportArtifactData }
  | {
      type: "browser.fill.progress";
      records: BrowserFillRecordView[];
      reviewing: boolean;
    }
  | {
      type: "browser.review.decision";
      fillId: string;
      decision: "accepted" | "rejected";
    }
  | {
      type: "browser.review.complete";
      action: "accepted" | "rejected" | "mixed";
      acceptedCount: number;
      rejectedCount: number;
    }
  | {
      type: "browser.captcha.detected";
      kind: "recaptcha" | "hcaptcha" | "geetest" | "slider" | "image" | "unknown";
      detail?: string;
    };

/**
 * B4: 面向渲染进程的填写记录视图；records 由 fillLog 派生，用于
 * FillProgressCard 渲染徽章 / 已写入值预览。
 */
export interface BrowserFillRecordView {
  fillId: string;
  label: string;
  elementType:
    | "input"
    | "textarea"
    | "select"
    | "checkbox"
    | "radio"
    | "contenteditable";
  writtenValue: string;
  decision: "pending" | "accepted" | "rejected";
}

export interface ConversationRenameInput {
  conversationId: string;
  title: string;
}

export interface AgentPromptInput {
  conversationId: string;
  text: string;
  resumeReference?: ResumeChatReference;
}

export interface ResumeChatReference {
  artifactId: string;
  targetType: "resume" | "bullet" | "item" | "locked_field";
  targetId: string;
  label: string;
}

export interface ApprovalResolveInput {
  conversationId: string;
  requestId: string;
  decision: DesktopApprovalDecision;
}

export type BrowserPageType =
  | "jd"
  | "job_application_form"
  | "webmail_compose"
  | "unknown";

export type BrowserFillStatus = "idle" | "filling" | "reviewing" | "complete";

export interface BrowserState {
  isOpen: boolean;
  currentUrl: string | null;
  pageTitle: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  pageType: BrowserPageType;
  fillStatus: BrowserFillStatus;
}

export interface BrowserOpenInput {
  url?: string;
  theme?: "light" | "dark";
}

export interface BrowserNavigateInput {
  url: string;
}

export interface BrowserTabState {
  id: string;
  title: string;
  url: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface BrowserShellState {
  tabs: BrowserTabState[];
  activeTabId: string | null;
  theme: "light" | "dark";
  platform: DesktopPlatform;
  isMaximized: boolean;
}

export interface BrowserShellApi {
  platform: DesktopPlatform;
  ready(): void;
  requestState(): void;
  newTab(): void;
  closeTab(tabId: string): void;
  selectTab(tabId: string): void;
  navigate(url: string): void;
  goBack(): void;
  goForward(): void;
  reload(): void;
  reportChromeHeight(height: number): void;
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  onStateChanged(listener: (state: BrowserShellState) => void): () => void;
}

export type DesktopPlatform =
  | "aix"
  | "darwin"
  | "freebsd"
  | "linux"
  | "openbsd"
  | "sunos"
  | "win32"
  | "android"
  | "haiku"
  | "cygwin"
  | "netbsd";

export interface DesktopApi {
  platform: DesktopPlatform;
  auth: {
    getCurrentUser(): Promise<DesktopUser | undefined>;
    login(email: string, password: string): Promise<DesktopUser>;
    requestEmailCode(email: string): Promise<EmailChallengeView>;
    verifyEmailCode(
      email: string,
      challengeId: string,
      code: string,
    ): Promise<DesktopUser>;
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
    onEvent(
      listener: (
        conversationId: string,
        event: DesktopAgentEvent,
      ) => void,
    ): () => void;
  };
  library: {
    list(): Promise<ResumeLibraryEntry[]>;
    rename(input: LibraryRenameInput): Promise<ResumeFull>;
    archive(input: LibraryArchiveInput): Promise<ResumeFull>;
    deleteDraft(input: LibraryDeleteDraftInput): Promise<void>;
    getCheckpoints(artifactId: string): Promise<ResumeDraftCheckpoint[]>;
    restoreCheckpoint(input: LibraryRestoreCheckpointInput): Promise<LocalResumeDraft>;
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
    onFillProgress(
      listener: (payload: {
        records: BrowserFillRecordView[];
        reviewing: boolean;
      }) => void,
    ): () => void;
    onReviewDecision(
      listener: (payload: {
        fillId: string;
        decision: "accepted" | "rejected";
      }) => void,
    ): () => void;
    onReviewComplete(
      listener: (payload: {
        action: "accepted" | "rejected" | "mixed";
        acceptedCount: number;
        rejectedCount: number;
      }) => void,
    ): () => void;
    onCaptchaDetected(
      listener: (payload: {
        kind:
          | "recaptcha"
          | "hcaptcha"
          | "geetest"
          | "slider"
          | "image"
          | "unknown";
        detail?: string;
      }) => void,
    ): () => void;
  };
}
