import type { AuthenticatedRequester } from "./api-transport.js";
import { normalizeResumeFull, normalizeResumeList } from "./resume-normalizers.js";
import type {
  ResumeBrowserLayoutObservation,
  ResumePublicationAcceptResult,
  ResumePublicationGateway,
  ResumePublicationStageResult,
  ResumePublicationVerification,
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

  public stageNew(
    payload: ResumeSaveApprovalPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<ResumePublicationStageResult> {
    return this.post("/v1/product/resumes/staged", stageBody(payload, idempotencyKey), signal);
  }

  public stageVariant(
    payload: ResumeSaveApprovalPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<ResumePublicationStageResult> {
    const resumeId = required(payload.resumeId, "resumeId");
    return this.post(
      `/v1/product/resumes/${encodeURIComponent(resumeId)}/variants`,
      stageBody(payload, idempotencyKey),
      signal,
    );
  }

  public verify(
    resumeId: string,
    variantId: string,
    observation: ResumeBrowserLayoutObservation,
    signal?: AbortSignal,
  ): Promise<ResumePublicationVerification> {
    return this.post(
      actionPath(resumeId, variantId, "verify-layout"),
      { observation },
      signal,
    );
  }

  public accept(
    resumeId: string,
    variantId: string,
    signal?: AbortSignal,
  ): Promise<ResumePublicationAcceptResult> {
    return this.post(actionPath(resumeId, variantId, "accept"), undefined, signal);
  }

  public async reject(
    resumeId: string,
    variantId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.post(actionPath(resumeId, variantId, "reject"), undefined, signal);
  }

  private post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.requester.request<T>(path, {
      method: "POST",
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
      ...(signal ? { signal } : {}),
    });
  }
}

function stageBody(payload: ResumeSaveApprovalPayload, idempotencyKey: string) {
  return {
    idempotencyKey,
    proposalId: payload.proposalId,
    title: payload.title,
    targetRole: payload.targetRole,
    jdId: payload.jdId,
    sourceFingerprint: payload.sourceFingerprint,
    structured: payload.structured,
    evidenceBindings: payload.evidenceBindings,
    expectedBaseVariantId: payload.expectedBaseVariantId,
  };
}

function actionPath(resumeId: string, variantId: string, action: string): string {
  return `/v1/product/resumes/${encodeURIComponent(required(resumeId, "resumeId"))}/variants/${encodeURIComponent(required(variantId, "variantId"))}/${action}`;
}

function required(value: string | undefined, label: string): string {
  const result = value?.trim();
  if (!result) throw new Error(`${label} 不能为空`);
  return result;
}
