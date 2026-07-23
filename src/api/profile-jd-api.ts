import type {
  JdReader,
  JdRecord,
  JdSearchOptions,
  JdSearchResult,
  UserProfile,
  UserProfileReader,
} from "./types.js";
import type { AuthenticatedRequester } from "./api-transport.js";
import {
  normalizeJdRecord,
  normalizeJdSearchResult,
  normalizeUserProfile,
} from "./normalizers.js";

export class ProfileJdApi implements UserProfileReader, JdReader {
  public constructor(private readonly requester: AuthenticatedRequester) {}

  public async getUserProfile(signal?: AbortSignal): Promise<UserProfile> {
    const value = await this.requester.request<unknown>("/v1/users/me/profile", {
      ...(signal ? { signal } : {}),
    });
    return normalizeUserProfile(value);
  }

  public async listJds(
    options: JdSearchOptions = {},
    signal?: AbortSignal,
  ): Promise<JdSearchResult> {
    const query = new URLSearchParams();
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    if (options.cursor) query.set("cursor", options.cursor);
    const queryString = query.toString();
    const value = await this.requester.request<unknown>(
      `/v1/product/jds${queryString ? `?${queryString}` : ""}`,
      { ...(signal ? { signal } : {}) },
    );
    return normalizeJdSearchResult(value);
  }

  public async getJd(jdId: string, signal?: AbortSignal): Promise<JdRecord> {
    const normalizedId = jdId.trim();
    if (!normalizedId) throw new Error("jdId 不能为空");
    const value = await this.requester.request<unknown>(
      `/v1/product/jds/${encodeURIComponent(normalizedId)}`,
      { ...(signal ? { signal } : {}) },
    );
    return normalizeJdRecord(value);
  }
}
