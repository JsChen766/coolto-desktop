import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import type { AgentTaskV1 } from "../../../agent-task/task-types.js";
import { projectBrowserAgentChrome } from "../../../browser/browser-agent-projection.js";
import type { BrowserAgentController } from "../../../browser/agent-control-types.js";
import type { BrowserPageOperator } from "../../../browser/types.js";
import { browserAgentActionForTool } from
  "../../../browser/browser-agent-action-mapping.js";
import type { BrowserAgentStatusBridge } from "../browser/browser-agent-status-bridge.js";
import {
  readBrowserAgentProjectionFacts,
  type BrowserAgentRuntimeFacts,
} from "./browser-agent-projection-reader.js";

const TERMINAL = new Set(["completed", "partially_completed", "failed", "canceled", "expired"]);
export type BrowserAgentProjectionReader = typeof readBrowserAgentProjectionFacts;
export type BrowserAgentRuntimeFactsProvider = (task: AgentTaskV1) => BrowserAgentRuntimeFacts;

export class BrowserAgentProjectionCoordinator {
  #disposed = false;
  #refreshVersion = 0;
  #scheduled = false;
  #taskId: string | null = null;
  readonly #unsubscribes: Array<() => void>;

  public constructor(
    private readonly services: AgentHarnessServices,
    private readonly status: BrowserAgentStatusBridge,
    private readonly browser: BrowserAgentController,
    private readonly page: BrowserPageOperator,
    private readonly readFacts: BrowserAgentProjectionReader = readBrowserAgentProjectionFacts,
    private readonly runtimeFacts?: BrowserAgentRuntimeFactsProvider,
  ) {
    this.#unsubscribes = [
      services.subscribe(() => this.#schedule()),
      services.runtimeProjection.subscribe(() => this.#schedule()),
      page.subscribeState(() => this.#schedule()),
    ];
  }

  public async initialize(): Promise<void> {
    const tasks = (await this.services.tasks.list())
      .filter((item) => !TERMINAL.has(item.status))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    for (const task of tasks) {
      if (await this.#isBrowserTask(task)) {
        await this.taskChanged(task);
        return;
      }
    }
    this.status.clearProjection();
  }

  public async taskChanged(task: AgentTaskV1): Promise<void> {
    this.#taskId = task.id;
    await this.#refresh();
  }

  public runtimeChanged(): void { this.#schedule(); }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#refreshVersion += 1;
    for (const unsubscribe of this.#unsubscribes) unsubscribe();
  }

  #schedule(): void {
    if (this.#scheduled || this.#disposed || !this.#taskId) return;
    this.#scheduled = true;
    this.#refreshVersion += 1;
    queueMicrotask(() => {
      this.#scheduled = false;
      void this.#refresh();
    });
  }

  async #refresh(): Promise<void> {
    const taskId = this.#taskId;
    if (!taskId || this.#disposed) return;
    const version = ++this.#refreshVersion;
    try {
      const task = await this.services.tasks.get(taskId);
      const runtime = this.runtimeFacts?.(task) ?? this.#defaultRuntimeFacts(task);
      const state = projectBrowserAgentChrome(await this.readFacts(
        this.services, task, runtime,
      ));
      if (this.#disposed || version !== this.#refreshVersion || taskId !== this.#taskId) {
        return;
      }
      if (!state) {
        this.status.clearProjection();
        return;
      }
      this.status.setProjection({ conversationId: task.conversationId, state, taskId });
    } catch {
      // A read-only projection must never fail the committed AgentTask transition.
    }
  }

  #defaultRuntimeFacts(task: AgentTaskV1): BrowserAgentRuntimeFacts {
    const control = this.status.controlFor(task.id);
    const action = task.status === "running" && task.activeRunId && control === "agent"
      ? this.services.runtimeProjection.current(task.id, task.activeRunId) : null;
    const actionKind = action ? browserAgentActionForTool(action.toolName) : null;
    const hasTab = Boolean(this.browser.getActiveTab());
    const reviewing = this.page.isReviewing();
    const pageAccess = hasTab ? {
      mode: reviewing ? "reviewing" as const
        : this.page.checkWriteAccess().ok ? "write_granted" as const : "read_only" as const,
      origin: null,
      targetTabId: null,
    } : null;
    const records = reviewing ? this.page.getFillLog() : [];
    return {
      control,
      currentAction: action && actionKind ? {
        ...actionKind,
        targetOrigin: action.targetOrigin,
        targetTabId: action.tabId,
        startedAt: action.startedAt,
      } : null,
      modelActive: false,
      pageAccess,
      review: reviewing ? { total: records.length, decided: 0 } : null,
    };
  }

  async #isBrowserTask(task: AgentTaskV1): Promise<boolean> {
    const active = await this.services.grants.getActive(task.id);
    return Boolean(active.grant?.allowedActions.some((action) =>
      action.startsWith("browser.")));
  }
}
