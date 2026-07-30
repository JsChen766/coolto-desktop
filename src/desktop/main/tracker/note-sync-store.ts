import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type { ApplicationNote, NoteInput, TrackerChildTombstone } from "../../../tracker/child-types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import { localNote, noteWritePayload, toNote } from "./note-sync-mapping.js";
import { activeChildren } from "./tracker-mapping-utils.js";
import {
  requireActive, requireApplication, requireInterviewLink, tombstone, type TrackerStorage,
} from "./tracker-store-utils.js";

export class NoteSyncStore {
  public constructor(
    private readonly store: TrackerStorage,
    private readonly trigger: () => void,
    private readonly initialSync: () => Promise<void>,
  ) {}

  public async list(applicationId?: string): Promise<ApplicationNote[]> {
    await this.initialSync();
    return activeChildren(this.store.listEntities("application_note"), applicationId)
      .map(toNote).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public async get(id: string): Promise<ApplicationNote> {
    await this.initialSync();
    return toNote(this.#active(id));
  }

  public async create(
    applicationId: string,
    input: NoteInput,
    id = createUuidV7(),
  ): Promise<ApplicationNote> {
    await this.initialSync();
    requireApplication(this.store, applicationId);
    requireInterviewLink(this.store, applicationId, input.interviewRoundId);
    const now = new Date().toISOString();
    this.store.enqueue({ operationId: createUuidV7(), entityType: "application_note",
      entityId: id, action: "create", expectedVersion: null,
      payload: noteWritePayload(applicationId, input),
      localPayload: localNote(id, applicationId, input, now), createdAt: now });
    return this.#finish(id);
  }

  public async update(id: string, input: NoteInput): Promise<ApplicationNote> {
    await this.initialSync();
    const entity = this.#active(id);
    const current = toNote(entity);
    requireInterviewLink(this.store, current.applicationId, input.interviewRoundId);
    const now = new Date().toISOString();
    this.store.enqueue({ operationId: createUuidV7(), entityType: "application_note",
      entityId: id, action: "update", expectedVersion: entity.entityVersion,
      payload: noteWritePayload(current.applicationId, input),
      localPayload: localNote(id, current.applicationId, input, now, current), createdAt: now });
    return this.#finish(id);
  }

  public async delete(id: string): Promise<TrackerChildTombstone> {
    await this.initialSync();
    const entity = this.#active(id);
    const now = new Date().toISOString();
    this.store.enqueue({ operationId: createUuidV7(), entityType: "application_note",
      entityId: id, action: "delete", expectedVersion: entity.entityVersion,
      payload: {}, localPayload: structuredClone(entity.payload), createdAt: now });
    this.trigger();
    return tombstone(this.store.getEntity("application_note", id)!);
  }

  public raw(id: string): LocalEntity | undefined {
    return this.store.getEntity("application_note", id);
  }

  #active(id: string) { return requireActive(this.store, "application_note", id, "笔记"); }
  #finish(id: string): ApplicationNote {
    this.trigger();
    return toNote(this.store.getEntity("application_note", id)!);
  }
}
