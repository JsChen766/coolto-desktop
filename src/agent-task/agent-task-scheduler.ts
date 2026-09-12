import type { AgentHarnessServices } from "./agent-harness-services.js";
import type { AgentTaskRunner } from "./agent-task-runner.js";

/** App-open-only timer wake-up. It emits a generic event and never picks a business step. */
export class AgentTaskScheduler {
  #timer: ReturnType<typeof setInterval> | undefined;
  #quiescing = false;
  #tickChain: Promise<void> = Promise.resolve();

  public constructor(
    private readonly services: AgentHarnessServices,
    private readonly runner: AgentTaskRunner,
    private readonly prepareTask: (taskId: string) => Promise<void> = async () => undefined,
  ) {}

  public start(): void {
    if (this.#timer || this.#quiescing) return;
    this.#timer = setInterval(() => void this.tick().catch(() => {}), 1_000);
  }

  public dispose(): void {
    this.#quiescing = true;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  public async quiesce(): Promise<void> {
    this.dispose();
    await this.#tickChain;
  }

  public async tick(now = Date.now()): Promise<void> {
    if (this.#quiescing) return;
    const next = this.#tickChain.then(() => this.#tickOnce(now));
    this.#tickChain = next.then(() => undefined, () => undefined);
    await next;
  }

  async #tickOnce(now: number): Promise<void> {
    if (this.#quiescing) return;
    const tasks = await this.services.tasks.list();
    for (const task of tasks) {
      if (this.#quiescing) return;
      if (task.status === "queued" && await this.#isAutoStartLoop(task.id, now)) {
        await this.prepareTask(task.id)
          .then(() => this.#quiescing ? undefined : this.runner.start(task.id))
          .catch(() => undefined);
        continue;
      }
      const wakeAfter = task.waiting?.wakeAfter;
      if (task.status !== "waiting" || !task.waiting) continue;
      if (task.waiting.reason === "timer") {
        const wakeTime = wakeAfter ? Date.parse(wakeAfter) : Number.NaN;
        if (!Number.isFinite(wakeTime) || wakeTime > now) continue;
        await this.services.events.enqueue({
          taskId: task.id, source: "timer", type: "timer.ready",
          trust: "trusted_system", occurredAt: new Date(now).toISOString(),
          dedupeKey: `timer:${task.id}:${wakeAfter}`,
          payloadRef: null, payloadHash: task.goalHash,
        });
      } else if (!await this.#hasWakeEvent(task.id, task.waiting.eventTypes)) continue;
      if (this.#quiescing) return;
      await this.prepareTask(task.id)
        .then(() => this.#quiescing ? undefined : this.runner.resumeFromEvents(task.id))
        .catch(() => undefined);
    }
  }

  async #hasWakeEvent(taskId: string, eventTypes: string[]): Promise<boolean> {
    const pending = await this.services.events.pending(taskId);
    return pending.some((event) => eventTypes.length === 0 || eventTypes.includes(event.type));
  }

  async #isAutoStartLoop(taskId: string, now: number): Promise<boolean> {
    const active = await this.services.grants.getActive(taskId);
    const kind = active.grant?.jobCriteria.loopKind ?? active.grant?.connectorPolicy?.loopKind;
    const scheduled = active.grant?.connectorPolicy?.autoStartAfter;
    const scheduledAt = typeof scheduled === "string" ? Date.parse(scheduled) : null;
    return !active.revocation &&
      (scheduledAt === null || Number.isFinite(scheduledAt) && scheduledAt <= now) &&
      ["resume_job_apply", "mail_app_schedule", "application_follow_up", "interview_briefing",
        "application_strategy", "risk_deadline_watch"].includes(String(kind));
  }
}
