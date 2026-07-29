import type {
  ExperienceCreateInput,
  ExperienceDetail,
  ExperienceReader,
  ExperienceSearchOptions,
  ExperienceSearchResult,
  ExperienceWriter,
} from "../../../api/types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import {
  buildLocalExperience,
  toExperienceDetail,
  toExperienceWritePayload,
} from "./experience-sync-mapping.js";
import { filterExperiences } from "./experience-search.js";

/**
 * Local-first store for experiences. Reads come from the local projection;
 * writes enqueue into the Outbox and are pushed by the sync worker. The backend
 * remains the authoritative source of `entityVersion`.
 */
export class ExperienceSyncStore implements ExperienceReader, ExperienceWriter {
  public constructor(
    private readonly store: LocalSyncStore,
    private readonly trigger: () => void,
    private readonly initialSync: () => Promise<void>,
  ) {}

  public async searchExperiences(
    options: ExperienceSearchOptions = {},
    _signal?: AbortSignal,
  ): Promise<ExperienceSearchResult> {
    await this.initialSync();
    const all = this.#activeExperiences();
    const { items, nextCursor } = filterExperiences(all, options);
    return { items, nextCursor };
  }

  public async getExperience(
    experienceId: string,
    _signal?: AbortSignal,
  ): Promise<ExperienceDetail> {
    await this.initialSync();
    const normalizedId = experienceId.trim();
    if (!normalizedId) throw new Error("experienceId 不能为空");
    const entity = this.store.getEntity("experience", normalizedId);
    if (!entity || entity.operation === "delete") {
      throw new Error(`经历 ${normalizedId} 不存在`);
    }
    return toExperienceDetail(entity);
  }

  public async createExperience(
    input: ExperienceCreateInput,
    _signal?: AbortSignal,
  ): Promise<ExperienceDetail> {
    const identity = input.idempotencyKey
      ? this.store.resolveCreateIdentity(
          "experience",
          input.idempotencyKey,
          idempotencyRequest(input),
        )
      : { entityId: createUuidV7(), operationId: createUuidV7() };
    const existing = this.store.getEntity("experience", identity.entityId);
    if (existing) return toExperienceDetail(existing);
    const id = identity.entityId;
    const revisionId = createUuidV7();
    const payload = toExperienceWritePayload(input, revisionId);
    const now = new Date().toISOString();
    const localPayload = buildLocalExperience(id, revisionId, input, now);
    this.store.enqueue({
      operationId: identity.operationId,
      entityType: "experience",
      entityId: id,
      action: "create",
      expectedVersion: null,
      payload,
      localPayload,
    });
    this.trigger();
    const entity = this.store.getEntity("experience", id);
    if (!entity) throw new Error("经历本地写入失败");
    return toExperienceDetail(entity);
  }

  #activeExperiences(): ExperienceDetail[] {
    return this.store
      .listEntities("experience")
      .filter((entity) => entity.operation !== "delete")
      .map(toExperienceDetail);
  }
}

function idempotencyRequest(input: ExperienceCreateInput): Record<string, unknown> {
  const { idempotencyKey: _key, ...request } = input;
  return request;
}
