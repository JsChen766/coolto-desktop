import { recordLocalDiagnostic } from "./local-event-log.js";
import type {
  LocalDiagnosticAction,
  LocalDiagnosticPhase,
} from "./types.js";

/** Metadata-only product action for local events.jsonl timeline. */
export function recordProductAction(
  action: LocalDiagnosticAction,
  phase: LocalDiagnosticPhase,
  detail?: Record<string, unknown>,
): void {
  recordLocalDiagnostic({ action, phase, detail });
}

const MANAGED_TASK_PHASE: Record<string, LocalDiagnosticPhase> = {
  awaiting_consent: "waiting_user",
  queued: "started",
  running: "started",
  waiting: "waiting_user",
  completed: "success",
  partially_completed: "success",
  failed: "failure",
  expired: "failure",
  canceled: "cancelled",
  paused: "cancelled",
};

/** Map AgentTask status to a diagnostics phase and record managed_task. */
export function recordManagedTaskStatus(
  status: string,
  detail?: Record<string, unknown>,
): void {
  const phase = MANAGED_TASK_PHASE[status];
  if (!phase) return;
  recordProductAction("managed_task", phase, {
    status,
    ...detail,
  });
}
