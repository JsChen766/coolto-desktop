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
