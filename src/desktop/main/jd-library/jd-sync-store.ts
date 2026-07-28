import type {
  JdCreateInput,
  JdReader,
  JdRecord,
  JdSearchOptions,
  JdSearchResult,
  JdWriter,
} from "../../../api/types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import {
  assignRequirements,
  buildLocalJd,
  filterJds,
  toJdRecord,
  toJdWritePayload,
} from "./jd-sync-mapping.js";

/**
 * Local-first store for job descriptions. Reads come from the local projection;
 * writes enqueue into the Outbox and are pushed by the sync worker. Requirement
 * IDs are assigned once at create time and stay stable across sync.
 */
export class JdSyncStore implements JdReader, JdWriter {
  public constructor(
    private readonly store: LocalSyncStore,
    private readonly trigger: () => void,
    private readonly initialSync: () => Promise<void>,
  ) {}

  public async listJds(
    options: JdSearchOptions = {},
    _signal?: AbortSignal,
  ): Promise<JdSearchResult> {
    await this.initialSync();
    const all = this.#activeJds();
    const { items, nextCursor } = filterJds(all, options);
    return { items, nextCursor };
  }

  public async getJd(jdId: string, _signal?: AbortSignal): Promise<JdRecord> {
    await this.initialSync();
    const normalizedId = jdId.trim();
    if (!normalizedId) throw new Error("jdId 不能为空");
    const entity = this.store.getEntity("job_description", normalizedId);
    if (!entity || entity.operation === "delete") {
      throw new Error(`JD ${normalizedId} 不存在`);
    }
    return toJdRecord(entity);
  }

  public async createJd(
    input: JdCreateInput,
    _signal?: AbortSignal,
  ): Promise<JdRecord> {
    const identity = input.idempotencyKey
      ? this.store.resolveCreateIdentity(
          "job_description",
          input.idempotencyKey,
          idempotencyRequest(input),
        )
      : { entityId: createUuidV7(), operationId: createUuidV7() };
    const existing = this.store.getEntity("job_description", identity.entityId);
    if (existing) return toJdRecord(existing);
    const id = identity.entityId;
    const now = new Date().toISOString();
    const requirements = assignRequirements(input.requirements);
    const localPayload = buildLocalJd(id, input, requirements, now);
    this.store.enqueue({
      operationId: identity.operationId,
      entityType: "job_description",
      entityId: id,
      action: "create",
      expectedVersion: null,
      payload: toJdWritePayload(input, requirements),
      localPayload,
    });
    this.trigger();
    const entity = this.store.getEntity("job_description", id);
    if (!entity) throw new Error("JD 本地写入失败");
    return toJdRecord(entity);
  }

  #activeJds(): JdRecord[] {
    return this.store
      .listEntities("job_description")
      .filter((entity) => entity.operation !== "delete")
      .map(toJdRecord);
  }
}

function idempotencyRequest(input: JdCreateInput): Record<string, unknown> {
  return {
    title: input.title,
    rawText: input.rawText,
    company: input.company ?? null,
    targetRole: input.targetRole ?? null,
    requirements: input.requirements ?? [],
  };
}
