import { createUuidV7 } from "../../../sync/uuid-v7.js";
import type { InterviewInput, InterviewRound, TrackerChildTombstone } from "../../../tracker/child-types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import { interviewWritePayload, localInterview, toInterview } from "./interview-sync-mapping.js";
import { activeChildren } from "./tracker-mapping-utils.js";
import { requireActive, requireApplication, tombstone, type TrackerStorage } from "./tracker-store-utils.js";

export class InterviewSyncStore {
  public constructor(
    private readonly store: TrackerStorage,
    private readonly trigger: () => void,
    private readonly initialSync: () => Promise<void>,
  ) {}

  public async list(applicationId?: string): Promise<InterviewRound[]> {
    await this.initialSync();
    return activeChildren(this.store.listEntities("interview_round"), applicationId)
      .map(toInterview)
      .sort((a, b) => a.roundNumber - b.roundNumber || a.createdAt.localeCompare(b.createdAt));
  }

  public async get(id: string): Promise<InterviewRound> {
    await this.initialSync();
    return toInterview(this.#active(id));
  }

  public async create(
    applicationId: string,
    input: InterviewInput,
    id = createUuidV7(),
  ): Promise<InterviewRound> {
    await this.initialSync();
    requireApplication(this.store, applicationId);
    if ((await this.list(applicationId)).some((item) => item.roundNumber === input.roundNumber)) {
      throw new Error(`第 ${input.roundNumber} 轮面试已存在`);
    }
    const now = new Date().toISOString();
    this.store.enqueue({
      operationId: createUuidV7(), entityType: "interview_round", entityId: id,
      action: "create", expectedVersion: null,
      payload: interviewWritePayload(applicationId, input),
      localPayload: localInterview(id, applicationId, input, now), createdAt: now,
    });
    return this.#finish(id);
  }

  public async update(id: string, input: InterviewInput): Promise<InterviewRound> {
    await this.initialSync();
    const entity = this.#active(id);
    const current = toInterview(entity);
    const duplicate = (await this.list(current.applicationId)).find(
      (item) => item.id !== id && item.roundNumber === input.roundNumber,
    );
    if (duplicate) throw new Error(`第 ${input.roundNumber} 轮面试已存在`);
    const now = new Date().toISOString();
    this.store.enqueue({
      operationId: createUuidV7(), entityType: "interview_round", entityId: id,
      action: "update", expectedVersion: entity.entityVersion,
      payload: interviewWritePayload(current.applicationId, input),
      localPayload: localInterview(id, current.applicationId, input, now, current), createdAt: now,
    });
    return this.#finish(id);
  }

  public async delete(id: string): Promise<TrackerChildTombstone> {
    await this.initialSync();
    const entity = this.#active(id);
    const now = new Date().toISOString();
    this.store.enqueue({ operationId: createUuidV7(), entityType: "interview_round",
      entityId: id, action: "delete", expectedVersion: entity.entityVersion,
      payload: {}, localPayload: structuredClone(entity.payload), createdAt: now });
    this.trigger();
    return tombstone(this.store.getEntity("interview_round", id)!);
  }

  public raw(id: string): LocalEntity | undefined {
    return this.store.getEntity("interview_round", id);
  }

  #active(id: string): LocalEntity {
    return requireActive(this.store, "interview_round", id, "面试记录");
  }

  #finish(id: string): InterviewRound {
    this.trigger();
    return toInterview(this.store.getEntity("interview_round", id)!);
  }
}
