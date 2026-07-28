import { randomUUID } from "node:crypto";

import type { AuthenticatedRequester } from "./api-transport.js";
import {
  normalizeExperienceDetail,
  normalizeExperienceSearchResult,
  normalizeExperienceSummary,
} from "./experience-normalizers.js";
import type {
  ExperienceCreateInput,
  ExperienceDetail,
  ExperienceReader,
  ExperienceSearchOptions,
  ExperienceSearchResult,
  ExperienceWriter,
} from "./types.js";

export class ExperienceApi implements ExperienceReader, ExperienceWriter {
  public constructor(private readonly requester: AuthenticatedRequester) {}

  public async searchExperiences(
    options: ExperienceSearchOptions = {},
    signal?: AbortSignal,
  ): Promise<ExperienceSearchResult> {
    const query = new URLSearchParams();
    if (options.q) query.set("q", options.q);
    if (options.category) query.set("category", options.category);
    for (const tag of options.tags ?? []) query.append("tags", tag);
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    if (options.cursor) query.set("cursor", options.cursor);
    const queryString = query.toString();
    const value = await this.requester.request<unknown>(
      `/v1/product/experiences${queryString ? `?${queryString}` : ""}`,
      { ...(signal ? { signal } : {}) },
    );
    return normalizeExperienceSearchResult(value);
  }

  public async getExperience(
    experienceId: string,
    signal?: AbortSignal,
  ): Promise<ExperienceDetail> {
    const normalizedId = experienceId.trim();
    if (!normalizedId) throw new Error("experienceId 不能为空");
    const value = await this.requester.request<unknown>(
      `/v1/product/experiences/${encodeURIComponent(normalizedId)}`,
      { ...(signal ? { signal } : {}) },
    );
    return normalizeExperienceDetail(value);
  }

  public async createExperience(
    input: ExperienceCreateInput,
    signal?: AbortSignal,
  ): Promise<ExperienceDetail> {
    const value = await this.requester.request<unknown>(
      "/v1/product/experiences",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": input.idempotencyKey ?? randomUUID(),
        },
        body: JSON.stringify({
          category: input.category,
          title: input.title,
          content: input.content,
          organization: input.organization ?? null,
          role: input.role ?? null,
          location: input.location ?? null,
          start_date: input.startDate ?? null,
          end_date: input.endDate ?? null,
          tags: input.tags ?? [],
        }),
        ...(signal ? { signal } : {}),
      },
    );
    const created = normalizeExperienceSummary(value);
    return this.getExperience(created.id, signal);
  }
}
