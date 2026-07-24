import type { AuthenticatedRequester } from "./api-transport.js";
import { normalizeResumeFull, normalizeResumeList } from "./resume-normalizers.js";
import type {
  ResumePublicationGateway,
  ResumePublicationResult,
  ResumeSaveApprovalPayload,
} from "../resume/save/types.js";

export class ResumePublicationApi implements ResumePublicationGateway {
  public constructor(private readonly requester: AuthenticatedRequester) {}

  public async listResumes(signal?: AbortSignal) {
    const value = await this.requester.request<unknown>(
      "/v1/product/resumes?limit=100",
      { ...(signal ? { signal } : {}) },
    );
    return normalizeResumeList(value);
  }

  public async getResume(resumeId: string, signal?: AbortSignal) {
    const value = await this.requester.request<unknown>(
      `/v1/product/resumes/${encodeURIComponent(required(resumeId, "resumeId"))}`,
      { ...(signal ? { signal } : {}) },
    );
    return normalizeResumeFull(value);
  }

  public async publishNew(
    payload: ResumeSaveApprovalPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<ResumePublicationResult> {
    const value = await this.write(
      "/v1/product/resumes/publish",
      "POST",
      publishBody(payload, idempotencyKey),
      signal,
    );
    return normalizePublication(value);
  }

  public async publishExisting(
    payload: ResumeSaveApprovalPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<ResumePublicationResult> {
    const resumeId = required(payload.resumeId, "resumeId");
    const value = await this.write(
      `/v1/product/resumes/${encodeURIComponent(resumeId)}/publish`,
      "PUT",
      publishBody(payload, idempotencyKey),
      signal,
    );
    return normalizePublication(value);
  }

  private write(
    path: string,
    method: "POST" | "PUT",
    body: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.requester.request<unknown>(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  }
}

function publishBody(payload: ResumeSaveApprovalPayload, idempotencyKey: string) {
  return {
    idempotencyKey,
    proposalId: payload.proposalId,
    title: payload.title,
    targetRole: payload.targetRole,
    jdId: payload.jdId,
    sourceFingerprint: payload.sourceFingerprint,
    structured: payload.structured,
    evidenceBindings: payload.evidenceBindings,
    observation: payload.observation,
    expectedContentHash: payload.expectedContentHash,
  };
}

function normalizePublication(value: unknown): ResumePublicationResult {
  const source = record(value);
  return {
    ...normalizeResumeFull(source),
    created: source.created === true,
    pageUsageRatio: typeof source.pageUsageRatio === "number" ? source.pageUsageRatio : 0,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed resume publication response");
  }
  return value as Record<string, unknown>;
}

function required(value: string | undefined, label: string): string {
  const result = value?.trim();
  if (!result) throw new Error(`${label} 不能为空`);
  return result;
}
