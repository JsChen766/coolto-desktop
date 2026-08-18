import { createHash } from "node:crypto";

import { normalizeResumeFull } from "../../../api/resume-normalizers.js";
import type { ResumeSaveApprovalPayload } from "../../../resume/save/types.js";
import type { ResumeFull } from "../../../resume/types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";

export function publicationIdentityRequest(
  payload: ResumeSaveApprovalPayload,
): Record<string, unknown> {
  const { proposalId: _proposalId, observation, ...request } = payload;
  const { idempotency_key: _layoutKey, ...stableObservation } = observation;
  return { ...request, observation: stableObservation };
}

export function samePublication(left: ResumeFull, right: ResumeFull): boolean {
  return JSON.stringify(toWritePayload(left)) === JSON.stringify(toWritePayload(right));
}

export function buildLocalResume(
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
    qualityIssues: (payload.structured.quality_issues ?? []).map((issue) => ({
      code: issue.code,
      message: issue.message,
    })),
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

export function toResume(entity: LocalEntity): ResumeFull {
  return normalizeResumeFull({
    ...entity.payload,
    entityVersion: Math.max(1, entity.entityVersion),
    deletedAt: entity.operation === "delete" ? entity.changedAt : null,
  });
}

export function toLocalPayload(full: ResumeFull): Record<string, unknown> {
  return {
    ...toWritePayload(full),
    id: full.id,
    content: full.content,
    contentHash: full.contentHash,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
  };
}

export function toWritePayload(full: ResumeFull): Record<string, unknown> {
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

export function usageRatio(payload: ResumeSaveApprovalPayload): number {
  const available = payload.observation.available_height_px;
  return available === 0 ? 0 : payload.observation.used_height_px / available;
}

function emptyScore() {
  return { overall: 0, relevance: 0, clarity: 0, evidenceStrength: 0, quantifiedImpact: 0 };
}
