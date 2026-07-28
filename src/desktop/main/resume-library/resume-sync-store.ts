import { createHash } from "node:crypto";

import { normalizeResumeFull } from "../../../api/resume-normalizers.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import type {
  ResumePublicationGateway,
  ResumePublicationResult,
  ResumeSaveApprovalPayload,
} from "../../../resume/save/types.js";
import type { ResumeFull, ResumeStatus } from "../../../resume/types.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";

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
    _idempotencyKey: string,
  ): Promise<ResumePublicationResult> {
    const id = createUuidV7();
    const full = buildLocalResume(id, payload, undefined);
    this.enqueue(id, "create", null, full);
	await this.linkDraft(payload.candidateId, full);
    return { ...full, created: true, pageUsageRatio: usageRatio(payload) };
  }

  public async publishExisting(
    payload: ResumeSaveApprovalPayload,
    _idempotencyKey: string,
  ): Promise<ResumePublicationResult> {
    if (!payload.resumeId) throw new Error("resumeId 不能为空");
    const current = await this.getResume(payload.resumeId);
    if (
      payload.expectedContentHash &&
      payload.expectedContentHash !== current.contentHash
    ) {
      throw new Error("云端简历内容已变化，请重新确认后再覆盖");
    }
    const full = buildLocalResume(current.id, payload, current);
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
  ): void {
    this.store.enqueue({
      operationId: createUuidV7(),
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

function buildLocalResume(
  id: string,
  payload: ResumeSaveApprovalPayload,
  current: ResumeFull | undefined,
): ResumeFull {
  const now = new Date().toISOString();
  const content = JSON.stringify(payload.structured);
  const quality = payload.structured.quality_status;
  return {
    id,
    title: payload.title.trim(),
    targetRole: payload.targetRole,
    targetCompany: current?.targetCompany ?? null,
    jdId: payload.jdId || null,
    structured: structuredClone(payload.structured),
    content,
    contentHash: createHash("sha256").update(content).digest("hex"),
    schemaVersion: current?.schemaVersion ?? "resume-document-v1",
    status: "active",
    qualityStatus:
      quality === "passed" ? "passed" :
      quality === "failed" ? "failed" :
      quality === "needs_user_decision" ? "needs_revision" : "unverified",
    qualityIssues: payload.structured.quality_issues ?? [],
    qualityGateVersion: current?.qualityGateVersion ?? null,
    score: current?.score ?? emptyScore(),
    evidenceSummary: current?.evidenceSummary ?? [],
    riskSummary: current?.riskSummary ?? [],
    missingInfo: current?.missingInfo ?? [],
    entityVersion: current?.entityVersion ?? 1,
    deletedAt: null,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
}

function toResume(entity: LocalEntity): ResumeFull {
  return normalizeResumeFull({
    ...entity.payload,
    entityVersion: Math.max(1, entity.entityVersion),
    deletedAt: entity.operation === "delete" ? entity.changedAt : null,
  });
}

function toLocalPayload(full: ResumeFull): Record<string, unknown> {
  return {
    ...toWritePayload(full),
    id: full.id,
    content: full.content,
    contentHash: full.contentHash,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
  };
}

function toWritePayload(full: ResumeFull): Record<string, unknown> {
  return {
    title: full.title,
    targetRole: full.targetRole,
    targetCompany: full.targetCompany,
    jdId: full.jdId,
    structured: full.structured,
    schemaVersion: full.schemaVersion,
    status: full.status,
    qualityStatus: full.qualityStatus,
    qualityIssues: full.qualityIssues,
    qualityGateVersion: full.qualityGateVersion,
    score: {
      overall: full.score.overall,
      relevance: full.score.relevance,
      clarity: full.score.clarity,
      evidence_strength: full.score.evidenceStrength,
      quantified_impact: full.score.quantifiedImpact,
    },
    evidenceSummary: full.evidenceSummary.map((item) => ({
      requirement_id: item.requirementId,
      requirement_text: item.requirementText,
      supporting_claims: item.supportingClaims,
      match_score: item.matchScore,
    })),
    riskSummary: full.riskSummary,
    missingInfo: full.missingInfo,
  };
}

function usageRatio(payload: ResumeSaveApprovalPayload): number {
  const available = payload.observation.available_height_px;
  return available === 0 ? 0 : payload.observation.used_height_px / available;
}

function emptyScore() {
  return { overall: 0, relevance: 0, clarity: 0, evidenceStrength: 0, quantifiedImpact: 0 };
}
