export type AgentTaskStatus =
  | "draft" | "awaiting_consent" | "queued" | "running"
  | "waiting" | "paused" | "completed" | "partially_completed"
  | "failed" | "canceled" | "expired";

export interface AgentTaskV1 {
  version: 1;
  id: string;
  ownerId: string;
  conversationId: string;
  capabilityProfile: "browser_enhance";
  goal: string;
  goalHash: string;
  grantId: string | null;
  status: AgentTaskStatus;
  waiting: null | {
    reason: "timer" | "external_event" | "approval" | "takeover" | "answer";
    wakeAfter: string | null;
    eventTypes: string[];
  };
  activeRunId: string | null;
  latestCheckpointId: string | null;
  createdAt: string;
  updatedAt: string;
  terminalAt: string | null;
}

export interface AgentRunV1 {
  version: 1;
  id: string;
  taskId: string;
  ownerId: string;
  sequence: number;
  wakeCause: "user" | "timer" | "environment_event" | "resume_after_restart";
  wakeEventIds: string[];
  status: "running" | "waiting" | "completed" | "failed" | "canceled";
  modelCalls: number;
  toolCalls: number;
  startedAt: string;
  endedAt: string | null;
  stopReason: string | null;
}

export interface AgentCheckpointV1 {
  version: 1;
  id: string;
  ownerId: string;
  taskId: string;
  runId: string;
  conversationId: string;
  lastMessageTimestamp: number | null;
  conversationUpdatedAt: string;
  grantHash: string;
  lastAcknowledgedEventId: string | null;
  receiptCursor: string | null;
  browserRefs: Array<{
    tabIdAtCapture: string;
    origin: string;
    lastKnownUrl: string;
    observationHash: string;
    lastActionReceiptId: string | null;
  }>;
  createdAt: string;
}
