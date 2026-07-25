import type { AuthenticatedRequester } from "./api-transport.js";
import { normalizeJdRecord } from "./normalizers.js";
import {
  JD_REQUIREMENT_V2_CATEGORIES,
  type JdCreateInput,
  type JdRecord,
  type JdRequirementV2Category,
  type JdRequirementV2Importance,
  type JdWriter,
} from "./types.js";

const V2_IMPORTANCE_VALUES: readonly JdRequirementV2Importance[] = [
  "must_have",
  "preferred",
  "optional",
];

function sanitizeV2Importance(
  value: JdRequirementV2Importance | null | undefined,
): JdRequirementV2Importance | null {
  return value && V2_IMPORTANCE_VALUES.includes(value) ? value : null;
}

function sanitizeV2Category(
  value: JdRequirementV2Category | null | undefined,
): JdRequirementV2Category | null {
  return value && JD_REQUIREMENT_V2_CATEGORIES.includes(value) ? value : null;
}

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
        v2_importance: sanitizeV2Importance(r.v2Importance),
        v2_category: sanitizeV2Category(r.v2Category),
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
