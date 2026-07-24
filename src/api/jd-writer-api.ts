import type { AuthenticatedRequester } from "./api-transport.js";
import { normalizeJdRecord } from "./normalizers.js";
import type { JdCreateInput, JdRecord, JdWriter } from "./types.js";

export class JdWriterApi implements JdWriter {
  public constructor(private readonly requester: AuthenticatedRequester) {}

  public async createJd(
    input: JdCreateInput,
    signal?: AbortSignal,
  ): Promise<JdRecord> {
    const body: Record<string, unknown> = {
      title: input.title,
      raw_text: input.rawText,
      company: input.company ?? null,
      target_role: input.targetRole ?? null,
    };
    if (input.requirements) {
      body.requirements = input.requirements.map((r) => ({
        text: r.text,
        category: r.category,
        importance: r.importance,
        keywords: r.keywords,
        v2_importance: r.v2Importance ?? null,
        v2_category: r.v2Category ?? null,
      }));
    }
    const value = await this.requester.request<unknown>("/v1/product/jds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    return normalizeJdRecord(value);
  }
}
