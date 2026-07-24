import type { ResumeCompileResult } from "../../resume/compiler-types.js";
import type {
  ResumeDraftArtifactReference,
  ResumeDraftSummary,
} from "../../resume/draft/types.js";
import type { ResumeStructure } from "../../resume/types.js";
import type { ResumeWorkspaceStatus } from "../../resume/workspace/types.js";

export type ChatRole = "user" | "assistant";

export interface DesktopUser {
  id: string;
  email: string;
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
    };

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
    logout(): Promise<void>;
  };
  conversations: {
    list(): Promise<ConversationSummary[]>;
    create(): Promise<ConversationDetail>;
    get(conversationId: string): Promise<ConversationDetail>;
    rename(input: ConversationRenameInput): Promise<ConversationSummary>;
    delete(conversationId: string): Promise<void>;
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
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
  };
}
