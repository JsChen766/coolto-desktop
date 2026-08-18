import type { LocalEntity } from "../sync/local-sync-types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import type {
  ResumePublicationGateway,
  ResumePublicationResult,
  ResumeSaveApprovalPayload,
} from "../../../resume/save/types.js";
import type { ResumeFull, ResumeStatus } from "../../../resume/types.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import {
  buildLocalResume,
  publicationIdentityRequest,
  samePublication,
  toLocalPayload,
  toResume,
  toWritePayload,
  usageRatio,
} from "./resume-sync-mapping.js";

/** Local-first store for the published Resume aggregate. */
export class ResumeSyncStore implements ResumePublicationGateway {
  public constructor(
    private readonly store: LocalSyncStore,
    private readonly trigger: () => void,
    private readonly initialSync: () => Promise<void>,
    private readonly linkDraft: (
      candidateId: string,
      resume: ResumeFull,
    ) => Promise<void>,
  ) {}

  public async listResumes(_signal?: AbortSignal): Promise<ResumeFull[]> {
    await this.initialSync();
    return this.store
      .listEntities("resume")
      .filter((entity) => entity.operation !== "delete")
      .map(toResume);
  }

  public async getResume(
    resumeId: string,
    _signal?: AbortSignal,
  ): Promise<ResumeFull> {
    await this.initialSync();
    const entity = this.store.getEntity("resume", resumeId);
    if (!entity || entity.operation === "delete") {
      throw new Error(`简历 ${resumeId} 不存在`);
    }
    return toResume(entity);
  }

  public async publishNew(
    payload: ResumeSaveApprovalPayload,
    idempotencyKey: string,
  ): Promise<ResumePublicationResult> {
    const identity = this.store.resolveCreateIdentity(
      "resume",
      idempotencyKey,
      publicationIdentityRequest(payload),
    );
    const existing = this.store.getEntity("resume", identity.entityId);
    if (existing?.operation === "delete") {
      throw new Error("此前保存的简历已删除，请编辑后重新保存");
    }
    const full = existing
      ? toResume(existing)
      : buildLocalResume(identity.entityId, payload, undefined);
    if (!existing) {
      this.enqueue(identity.entityId, "create", null, full, identity.operationId);
    }
    await this.linkDraft(payload.candidateId, full);
    return { ...full, created: true, pageUsageRatio: usageRatio(payload) };
  }

  public async publishExisting(
    payload: ResumeSaveApprovalPayload,
    _idempotencyKey: string,
  ): Promise<ResumePublicationResult> {
    if (!payload.resumeId) throw new Error("resumeId 不能为空");
    const current = await this.getResume(payload.resumeId);
    const full = buildLocalResume(current.id, payload, current);
    if (samePublication(current, full)) {
      await this.linkDraft(payload.candidateId, full);
      return { ...full, created: false, pageUsageRatio: usageRatio(payload) };
    }
    if (
      payload.expectedContentHash &&
      payload.expectedContentHash !== current.contentHash
    ) {
      throw new Error("云端简历内容已变化，请重新确认后再覆盖");
    }
    this.enqueue(current.id, "update", current.entityVersion, full);
    await this.linkDraft(payload.candidateId, full);
    return { ...full, created: false, pageUsageRatio: usageRatio(payload) };
  }

  public async rename(resumeId: string, title: string): Promise<ResumeFull> {
    const current = await this.getResume(resumeId);
    return this.replaceMetadata(current, { title: title.trim() });
  }

  public async setStatus(
    resumeId: string,
    status: ResumeStatus,
  ): Promise<ResumeFull> {
    const current = await this.getResume(resumeId);
    return this.replaceMetadata(current, { status });
  }

  public syncStatus(resumeId: string): LocalEntity["syncStatus"] | undefined {
    return this.store.getEntity("resume", resumeId)?.syncStatus;
  }

  private replaceMetadata(
    current: ResumeFull,
    patch: Partial<Pick<ResumeFull, "title" | "status">>,
  ): ResumeFull {
    const full = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.enqueue(current.id, "update", current.entityVersion, full);
    return full;
  }

  private enqueue(
    entityId: string,
    action: "create" | "update",
    expectedVersion: number | null,
    full: ResumeFull,
    operationId = createUuidV7(),
  ): void {
    this.store.enqueue({
      operationId,
      entityType: "resume",
      entityId,
      action,
      expectedVersion,
      payload: toWritePayload(full),
      localPayload: toLocalPayload(full),
    });
    this.trigger();
  }
}
