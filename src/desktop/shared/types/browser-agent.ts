import type { AgentTaskStatus } from "../../../agent-task/task-types.js";

export type BrowserAgentControl = "agent" | "user";
export type BrowserAgentWaitingReason =
  | "timer"
  | "external_event"
  | "approval"
  | "takeover"
  | "answer";

export type BrowserAgentActionKind =
  | "observe"
  | "navigate"
  | "tab"
  | "fill"
  | "review"
  | "download"
  | "submit"
  | "other";

export type BrowserAgentActionImpact =
  | "read"
  | "page_change"
  | "external_commitment";

export type BrowserAgentCapability =
  | "read"
  | "control"
  | "write"
  | "download"
  | "submit";

export type BrowserAgentActivityCode =
  | "task_event"
  | "takeover"
  | "return_control"
  | "policy_blocked"
  | "policy_requires_user"
  | "action_succeeded"
  | "action_partial"
  | "action_blocked"
  | "action_uncertain"
  | "action_failed";

/** Main-only, already-minimized facts accepted by the pure Chrome projector. */
export interface BrowserAgentProjectionFacts {
  task: {
    goal: string;
    status: AgentTaskStatus;
    waitingReason: BrowserAgentWaitingReason | null;
    updatedAt: string;
  };
  control: BrowserAgentControl;
  modelActive: boolean;
  currentAction: null | {
    kind: BrowserAgentActionKind;
    impact: BrowserAgentActionImpact;
    targetOrigin: string | null;
    /** Public Browser Shell tab identity, never a Task/Run/ToolCall id. */
    targetTabId: string | null;
    startedAt: string;
  };
  delegation: null | {
    domains: string[];
    capabilities: BrowserAgentCapability[];
    unattended: boolean;
    expiresAt: string;
    revokedAt: string | null;
  };
  pageAccess: null | {
    mode: "read_only" | "write_granted" | "reviewing";
    origin: string | null;
    /** Public Browser Shell tab identity. */
    targetTabId: string | null;
  };
  review: null | {
    total: number;
    decided: number;
  };
  activity: Array<{
    kind: "event" | "policy" | "receipt";
    code: BrowserAgentActivityCode;
    actionKind: BrowserAgentActionKind | null;
    origin: string | null;
    occurredAt: string;
  }>;
  commandError: string | null;
  commandPending: boolean;
}

export type BrowserAgentPhase =
  | "queued"
  | "planning"
  | "acting"
  | "waiting"
  | "reviewing"
  | "paused"
  | "user_control"
  | "revoked"
  | "expired"
  | "completed"
  | "partial"
  | "failed"
  | "stopped";

export interface BrowserAgentChromeView {
  goal: string;
  phase: BrowserAgentPhase;
  control: BrowserAgentControl;
  summary: string;
  currentAction: null | {
    kind: BrowserAgentActionKind;
    label: string;
    impact: BrowserAgentActionImpact;
    targetOrigin: string | null;
    startedAt: string;
  };
  /** Public Browser Shell tab identity used only for the trusted tab marker. */
  targetTabId: string | null;
  targetOrigin: string | null;
  delegation: null | {
    state: "active" | "expired" | "revoked";
    domains: string[];
    moreDomainCount: number;
    capabilities: BrowserAgentCapability[];
    unattended: boolean;
    expiresAt: string;
  };
  pageAccess: null | {
    mode: "read_only" | "write_granted" | "reviewing";
    origin: string | null;
  };
  review: null | { total: number; decided: number; pending: number };
  requiredUserAction: null | {
    kind: "approval" | "answer" | "review" | "return_control" | "resume";
    count: number | null;
    label: string;
  };
  recentActivity: Array<{
    kind: "event" | "policy" | "receipt";
    label: string;
    tone: "neutral" | "success" | "warning" | "danger";
    origin: string | null;
    occurredAt: string;
  }>;
  commands: {
    pause: boolean;
    resume: boolean;
    takeover: boolean;
    stop: boolean;
    openTask: true;
  };
  commandError: string | null;
  commandPending: boolean;
  updatedAt: string;
}

export interface BrowserAgentInspectorViewState {
  agent: BrowserAgentChromeView;
  locale: "zh-CN" | "en-US";
  mode: "docked" | "overlay";
  presentation: "open" | "closing";
  theme: "light" | "dark";
}

export interface BrowserAgentInspectorApi {
  ready(reducedMotion: boolean): void;
  close(): void;
  command(action: "pause" | "resume" | "takeover" | "stop"): void;
  openTask(): void;
  onStateChanged(listener: (state: BrowserAgentInspectorViewState) => void): () => void;
  onFocus(listener: () => void): () => void;
}
