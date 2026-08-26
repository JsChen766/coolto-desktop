import type { AgentHarnessServices } from "./agent-harness-services.js";
import type { AgentTaskRunner } from "./agent-task-runner.js";

/** App-open-only timer wake-up. It emits a generic event and never picks a business step. */
export class AgentTaskScheduler {
  #timer: ReturnType<typeof setInterval> | undefined;

  public constructor(
    private readonly services: AgentHarnessServices,
    private readonly runner: AgentTaskRunner,
  ) {}

  public start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.tick().catch(() => {}), 1_000);
  }

  public dispose(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  public async tick(now = Date.now()): Promise<void> {
    const tasks = await this.services.tasks.list();
    for (const task of tasks) {
      const wakeAfter = task.waiting?.wakeAfter;
      if (task.status !== "waiting" || task.waiting?.reason !== "timer" ||
          !wakeAfter || Date.parse(wakeAfter) > now) continue;
      await this.services.events.enqueue({
        taskId: task.id,
        source: "timer",
        type: "timer.ready",
        trust: "trusted_system",
        occurredAt: new Date(now).toISOString(),
        dedupeKey: `timer:${task.id}:${wakeAfter}`,
        payloadRef: null,
        payloadHash: task.goalHash,
      });
      await this.runner.resumeFromEvents(task.id).catch(() => undefined);
    }
  }
}
