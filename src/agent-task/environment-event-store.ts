import type { AgentHarnessStateRepository } from "./agent-harness-state-repository.js";
import type { EnvironmentEventV1 } from "./environment-event-types.js";
import { requireTask } from "./agent-task-store.js";
import { uuidV7 } from "./uuid-v7.js";

export type EnvironmentEventDraft = Pick<
  EnvironmentEventV1,
  "taskId" | "source" | "type" | "trust" | "occurredAt" |
  "dedupeKey" | "payloadRef" | "payloadHash"
>;

export class EnvironmentEventStore {
  public constructor(
    private readonly ownerId: string,
    private readonly repository: AgentHarnessStateRepository,
  ) {}

  public enqueue(draft: EnvironmentEventDraft): Promise<EnvironmentEventV1> {
    return this.repository.update((state) => {
      requireTask(state.tasks, draft.taskId, this.ownerId);
      const duplicate = state.events.find((event) =>
        event.ownerId === this.ownerId && event.dedupeKey === draft.dedupeKey,
      );
      if (duplicate) return duplicate;
      const event: EnvironmentEventV1 = {
        version: 1, id: uuidV7(), ownerId: this.ownerId,
        ...structuredClone(draft), receivedAt: new Date().toISOString(),
        status: "pending", deliveryAttempts: 0, deliveredAt: null,
        acknowledgedAt: null,
      };
      state.events.push(event);
      return event;
    });
  }

  public pending(taskId: string): Promise<EnvironmentEventV1[]> {
    return this.repository.read((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      return state.events.filter((event) =>
        event.taskId === taskId && ["pending", "delivered"].includes(event.status),
      ).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    });
  }

  public all(taskId: string): Promise<EnvironmentEventV1[]> {
    return this.repository.read((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      return state.events.filter((event) => event.taskId === taskId)
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    });
  }

  public get(taskId: string, eventId: string): Promise<EnvironmentEventV1> {
    return this.repository.read((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      const event = requireEvent(state.events, eventId, this.ownerId);
      if (event.taskId !== taskId) throw new Error("EnvironmentEvent 任务不匹配");
      return event;
    });
  }

  public findByDedupeKey(
    taskId: string,
    dedupeKey: string,
  ): Promise<EnvironmentEventV1 | undefined> {
    return this.repository.read((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      return state.events.find((event) =>
        event.taskId === taskId && event.dedupeKey === dedupeKey);
    });
  }

  public markDelivered(eventId: string): Promise<EnvironmentEventV1> {
    return this.repository.update((state) => {
      const event = requireEvent(state.events, eventId, this.ownerId);
      if (event.status === "acknowledged" || event.status === "dead_letter") return event;
      event.status = "delivered";
      event.deliveryAttempts += 1;
      event.deliveredAt = new Date().toISOString();
      return event;
    });
  }

  public acknowledge(eventId: string): Promise<EnvironmentEventV1> {
    return this.repository.update((state) => {
      const event = requireEvent(state.events, eventId, this.ownerId);
      if (event.status !== "delivered" && event.status !== "acknowledged") {
        throw new Error("EnvironmentEvent 必须先 delivered 再 acknowledged");
      }
      if (event.status !== "acknowledged") {
        event.status = "acknowledged";
        event.acknowledgedAt = new Date().toISOString();
      }
      return event;
    });
  }

  public deadLetter(eventId: string): Promise<EnvironmentEventV1> {
    return this.repository.update((state) => {
      const event = requireEvent(state.events, eventId, this.ownerId);
      event.status = "dead_letter";
      return event;
    });
  }
}

function requireEvent(
  events: EnvironmentEventV1[],
  eventId: string,
  ownerId: string,
): EnvironmentEventV1 {
  const event = events.find((candidate) => candidate.id === eventId);
  if (!event || event.ownerId !== ownerId) {
    throw new Error("EnvironmentEvent 不存在或不属于当前用户");
  }
  return event;
}
