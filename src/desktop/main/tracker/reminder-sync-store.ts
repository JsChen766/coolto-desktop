import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type { Reminder, ReminderInput, TrackerChildTombstone } from "../../../tracker/child-types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import { localReminder, reminderWritePayload, toReminder } from "./reminder-sync-mapping.js";
import { activeChildren } from "./tracker-mapping-utils.js";
import {
  requireActive, requireApplication, requireInterviewLink, tombstone, type TrackerStorage,
} from "./tracker-store-utils.js";

export class ReminderSyncStore {
  public constructor(
    private readonly store: TrackerStorage,
    private readonly trigger: () => void,
    private readonly initialSync: () => Promise<void>,
  ) {}

  public async list(applicationId?: string): Promise<Reminder[]> {
    await this.initialSync();
    return activeChildren(this.store.listEntities("reminder"), applicationId)
      .map(toReminder).sort((a, b) => a.remindAt.localeCompare(b.remindAt));
  }

  public async get(id: string): Promise<Reminder> {
    await this.initialSync();
    return toReminder(this.#active(id));
  }

  public async create(
    applicationId: string,
    input: ReminderInput,
    id = createUuidV7(),
  ): Promise<Reminder> {
    await this.initialSync();
    requireApplication(this.store, applicationId);
    requireInterviewLink(this.store, applicationId, input.interviewRoundId);
    const now = new Date().toISOString();
    this.store.enqueue({ operationId: createUuidV7(), entityType: "reminder", entityId: id,
      action: "create", expectedVersion: null,
      payload: reminderWritePayload(applicationId, input),
      localPayload: localReminder(id, applicationId, input, now), createdAt: now });
    return this.#finish(id);
  }

  public async update(id: string, input: ReminderInput): Promise<Reminder> {
    await this.initialSync();
    const entity = this.#active(id);
    const current = toReminder(entity);
    requireInterviewLink(this.store, current.applicationId, input.interviewRoundId);
    const now = new Date().toISOString();
    this.store.enqueue({ operationId: createUuidV7(), entityType: "reminder", entityId: id,
      action: "update", expectedVersion: entity.entityVersion,
      payload: reminderWritePayload(current.applicationId, input),
      localPayload: localReminder(id, current.applicationId, input, now, current), createdAt: now });
    return this.#finish(id);
  }

  public async markDelivered(id: string, deliveredAt: string): Promise<Reminder> {
    const current = await this.get(id);
    return this.update(id, {
      interviewRoundId: current.interviewRoundId, title: current.title,
      remindAt: current.remindAt, status: "delivered", deliveredAt,
    });
  }

  public async delete(id: string): Promise<TrackerChildTombstone> {
    await this.initialSync();
    const entity = this.#active(id);
    const now = new Date().toISOString();
    this.store.enqueue({ operationId: createUuidV7(), entityType: "reminder", entityId: id,
      action: "delete", expectedVersion: entity.entityVersion,
      payload: {}, localPayload: structuredClone(entity.payload), createdAt: now });
    this.trigger();
    return tombstone(this.store.getEntity("reminder", id)!);
  }

  public raw(id: string): LocalEntity | undefined { return this.store.getEntity("reminder", id); }
  #active(id: string) { return requireActive(this.store, "reminder", id, "提醒"); }
  #finish(id: string): Reminder {
    this.trigger();
    return toReminder(this.store.getEntity("reminder", id)!);
  }
}
