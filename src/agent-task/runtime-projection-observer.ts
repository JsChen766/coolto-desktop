export interface AgentRuntimeProjectionAction {
  callId: string;
  runId: string;
  startedAt: string;
  tabId: string | null;
  targetOrigin: string | null;
  taskId: string;
  toolName: string;
}

const MAX_ACTIONS = 64;

/** Ephemeral action context only; canonical task state remains in the repository. */
export class AgentRuntimeProjectionObserver {
  readonly #actions = new Map<string, AgentRuntimeProjectionAction>();
  readonly #listeners = new Set<() => void>();

  public start(action: AgentRuntimeProjectionAction): void {
    for (const [callId, existing] of this.#actions) {
      if (existing.taskId === action.taskId && existing.runId !== action.runId) {
        this.#actions.delete(callId);
      }
    }
    this.#actions.set(action.callId, structuredClone(action));
    while (this.#actions.size > MAX_ACTIONS) {
      const oldest = this.#actions.keys().next().value as string | undefined;
      if (!oldest) break;
      this.#actions.delete(oldest);
    }
    this.#notify();
  }

  public finish(callId: string): void {
    if (!this.#actions.delete(callId)) return;
    this.#notify();
  }

  public clearTask(taskId: string, runId?: string): void {
    let changed = false;
    for (const [callId, action] of this.#actions) {
      if (action.taskId !== taskId || runId && action.runId !== runId) continue;
      this.#actions.delete(callId);
      changed = true;
    }
    if (changed) this.#notify();
  }

  public current(taskId: string, runId: string): AgentRuntimeProjectionAction | null {
    const values = [...this.#actions.values()].filter((action) =>
      action.taskId === taskId && action.runId === runId);
    const current = values.at(-1);
    return current ? structuredClone(current) : null;
  }

  public subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      try { listener(); } catch { /* UI projection cannot fail task execution. */ }
    }
  }
}
