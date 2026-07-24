import type { AuthenticatedRequester } from "./api-transport.js";
import { normalizeResumeFull } from "./resume-normalizers.js";
import type { ResumeFull } from "../resume/types.js";

/**
 * Cloud operations for the resume library that are not part of the G5
 * publication flow: rename and archive/unarchive.
 */
export class ResumeLibraryApi {
  public constructor(private readonly requester: AuthenticatedRequester) {}

  public async rename(
    resumeId: string,
    title: string,
    signal?: AbortSignal,
  ): Promise<ResumeFull> {
    const value = await this.requester.request<unknown>(
      `/v1/product/resumes/${encodeURIComponent(resumeId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
        ...(signal ? { signal } : {}),
      },
    );
    return normalizeResumeFull(value);
  }

  public async archive(resumeId: string, signal?: AbortSignal): Promise<ResumeFull> {
    return this.patchStatus(resumeId, "archived", signal);
  }

  public async unarchive(resumeId: string, signal?: AbortSignal): Promise<ResumeFull> {
    return this.patchStatus(resumeId, "active", signal);
  }

  private async patchStatus(
    resumeId: string,
    status: string,
    signal?: AbortSignal,
  ): Promise<ResumeFull> {
    const value = await this.requester.request<unknown>(
      `/v1/product/resumes/${encodeURIComponent(resumeId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
        ...(signal ? { signal } : {}),
      },
    );
    return normalizeResumeFull(value);
  }
}
