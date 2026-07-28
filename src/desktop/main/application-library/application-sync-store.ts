import { createUuidV7 } from "../../../sync/uuid-v7.js";
import { canTransitionApplication } from "../../../tracker/application-status.js";
import type {
  ApplicationCreateInput,
  ApplicationListOptions,
  ApplicationListResult,
  ApplicationRecord,
  ApplicationReferenceOptions,
  ApplicationTombstone,
  ApplicationTransitionInput,
  ApplicationUpdateInput,
} from "../../../tracker/types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import {
  buildLocalApplication,
  buildTransitionedApplication,
  buildUpdatedApplication,
  filterApplications,
  type ApplicationSnapshots,
  toApplicationCreatePayload,
  toApplicationTransitionPayload,
  toApplicationUpdatePayload,
} from "./application-sync-mapping.js";
import {
  toApplicationRecord,
  toApplicationTombstone,
} from "./application-sync-normalizer.js";

type ApplicationStorage = Pick<
  LocalSyncStore,
  "getEntity" | "listEntities" | "resolveCreateIdentity" | "enqueue"
>;

/** Local-first Application aggregate store. Child Tracker entities stay separate. */
export class ApplicationSyncStore {
  public constructor(
    private readonly store: ApplicationStorage,
    private readonly trigger: () => void,
    private readonly initialSync: () => Promise<void>,
  ) {}

  public async listApplications(
    options: ApplicationListOptions = {},
  ): Promise<ApplicationListResult> {
    await this.initialSync();
    const applications = this.store
      .listEntities("application")
      .filter((entity) => entity.operation !== "delete")
      .map(toApplicationRecord);
    const { items, nextCursor } = filterApplications(applications, options);
    return { items, nextCursor };
  }

  public async getApplication(id: string): Promise<ApplicationRecord> {
    await this.initialSync();
    return toApplicationRecord(this.#active(id));
  }

  public async listReferenceOptions(): Promise<ApplicationReferenceOptions> {
    await this.initialSync();
    return {
      jds: this.#referenceOptions("job_description"),
      resumes: this.#referenceOptions("resume"),
    };
  }

  public async createApplication(
    input: ApplicationCreateInput,
  ): Promise<ApplicationRecord> {
    await this.initialSync();
    const snapshots = this.#createSnapshots(input);
    const request = identityRequest(input);
    const identity = input.idempotencyKey
      ? this.store.resolveCreateIdentity("application", input.idempotencyKey, request)
      : { entityId: createUuidV7(), operationId: createUuidV7() };
    const existing = this.store.getEntity("application", identity.entityId);
    if (existing && existing.operation !== "delete") return toApplicationRecord(existing);
    const now = new Date().toISOString();
    this.store.enqueue({
      operationId: identity.operationId,
      entityType: "application",
      entityId: identity.entityId,
      action: "create",
      expectedVersion: null,
      payload: toApplicationCreatePayload(input, snapshots),
      localPayload: buildLocalApplication(identity.entityId, input, snapshots, now),
      createdAt: now,
    });
    return this.#finish(identity.entityId);
  }

  public async updateApplication(
    id: string,
    input: ApplicationUpdateInput,
  ): Promise<ApplicationRecord> {
    await this.initialSync();
    const entity = this.#active(id);
    const current = toApplicationRecord(entity);
    const snapshots = this.#updateSnapshots(current, input);
    const now = new Date().toISOString();
    this.store.enqueue({
      operationId: createUuidV7(),
      entityType: "application",
      entityId: entity.entityId,
      action: "update",
      expectedVersion: entity.entityVersion,
      payload: toApplicationUpdatePayload(input),
      localPayload: buildUpdatedApplication(current, input, snapshots, now),
      createdAt: now,
    });
    return this.#finish(entity.entityId);
  }

  public async transitionApplication(
    id: string,
    input: ApplicationTransitionInput,
  ): Promise<ApplicationRecord> {
    await this.initialSync();
    const entity = this.#active(id);
    const current = toApplicationRecord(entity);
    if (!canTransitionApplication(current.status, input.toStatus)) {
      throw new Error(`非法投递状态迁移：${current.status} → ${input.toStatus}`);
    }
    const now = new Date().toISOString();
    this.store.enqueue({
      operationId: createUuidV7(),
      entityType: "application",
      entityId: entity.entityId,
      action: "transition",
      expectedVersion: entity.entityVersion,
      payload: toApplicationTransitionPayload(input),
      localPayload: buildTransitionedApplication(current, input.toStatus, now),
      createdAt: now,
    });
    return this.#finish(entity.entityId);
  }

  public async deleteApplication(id: string): Promise<ApplicationTombstone> {
    await this.initialSync();
    const entity = this.#active(id);
    const now = new Date().toISOString();
    this.store.enqueue({
      operationId: createUuidV7(),
      entityType: "application",
      entityId: entity.entityId,
      action: "delete",
      expectedVersion: entity.entityVersion,
      payload: {},
      localPayload: structuredClone(entity.payload),
      createdAt: now,
    });
    this.trigger();
    const tombstone = this.store.getEntity("application", entity.entityId);
    if (!tombstone) throw new Error("Application 本地删除失败");
    return toApplicationTombstone(tombstone);
  }

  #active(id: string): LocalEntity {
    const normalized = id.trim();
    if (!normalized) throw new Error("applicationId 不能为空");
    const entity = this.store.getEntity("application", normalized);
    if (!entity || entity.operation === "delete") {
      throw new Error(`Application ${normalized} 不存在`);
    }
    return entity;
  }

  #finish(id: string): ApplicationRecord {
    this.trigger();
    const entity = this.store.getEntity("application", id);
    if (!entity) throw new Error("Application 本地写入失败");
    return toApplicationRecord(entity);
  }

  #createSnapshots(input: ApplicationCreateInput): ApplicationSnapshots {
    return {
      jdTitle: this.#assetTitle("job_description", input.jdId, input.jdTitleSnapshot),
      resumeTitle: this.#assetTitle("resume", input.resumeId, input.resumeTitleSnapshot),
    };
  }

  #updateSnapshots(
    current: ApplicationRecord,
    input: ApplicationUpdateInput,
  ): ApplicationSnapshots {
    return {
      jdTitle: input.jdId === current.jdId
        ? current.jdTitleSnapshot
        : this.#assetTitle("job_description", input.jdId, null),
      resumeTitle: input.resumeId === current.resumeId
        ? current.resumeTitleSnapshot
        : this.#assetTitle("resume", input.resumeId, null),
    };
  }

  #assetTitle(
    entityType: "job_description" | "resume",
    id: string | null | undefined,
    fallback: string | null | undefined,
  ): string | null {
    if (!id) return fallback?.trim() || null;
    const entity = this.store.getEntity(entityType, id);
    if (!entity || entity.operation === "delete") throw new Error(`引用资产 ${id} 不存在`);
    const title = entity.payload.title;
    if (typeof title !== "string" || !title.trim()) throw new Error(`引用资产 ${id} 缺少标题`);
    return title;
  }

  #referenceOptions(
    entityType: "job_description" | "resume",
  ): ApplicationReferenceOptions["jds"] {
    return this.store
      .listEntities(entityType)
      .filter(
        (entity) =>
          entity.operation !== "delete" && entity.payload.status !== "archived",
      )
      .flatMap((entity) => {
        const title = entity.payload.title;
        return typeof title === "string" && title.trim()
          ? [{ id: entity.entityId, title }]
          : [];
      })
      .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
  }
}

function identityRequest(input: ApplicationCreateInput): Record<string, unknown> {
  const { idempotencyKey: _idempotencyKey, ...request } = input;
  return request;
}
