import type { AgentHarnessStateRepository } from "./agent-harness-state-repository.js";
import { requireTask } from "./agent-task-store.js";
import type {
  AiNativeArtifactDraft,
  AiNativeArtifactV1,
} from "./ai-native-artifact-types.js";
import { canonicalHash } from "./canonical-hash.js";
import type { JsonValue } from "./json-types.js";
import { uuidV7 } from "./uuid-v7.js";

export class AiNativeArtifactStore {
  public constructor(
    private readonly ownerId: string,
    private readonly repository: AgentHarnessStateRepository,
  ) {}

  public create(draft: AiNativeArtifactDraft): Promise<AiNativeArtifactV1> {
    validateDraft(draft);
    return this.repository.update((state) => {
      requireTask(state.tasks, draft.taskId, this.ownerId);
      const contentHash = canonicalHash(draft as unknown as JsonValue);
      const existing = state.aiNativeArtifacts.find((item) =>
        item.taskId === draft.taskId && item.dedupeKey === draft.dedupeKey);
      if (existing) {
        if (existing.contentHash !== contentHash) {
          throw new Error("AI Native 产物已存在，不能静默改写");
        }
        return existing;
      }
      const value = {
        version: 1, id: uuidV7(), ownerId: this.ownerId,
        ...structuredClone(draft), contentHash, createdAt: new Date().toISOString(),
      } as AiNativeArtifactV1;
      state.aiNativeArtifacts.push(value);
      return value;
    });
  }

  public list(taskId: string): Promise<AiNativeArtifactV1[]> {
    return this.repository.read((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      return state.aiNativeArtifacts.filter((item) => item.taskId === taskId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    });
  }
}

function validateDraft(draft: AiNativeArtifactDraft): void {
  if (!draft.taskId.trim() || !draft.dedupeKey.trim() || draft.dedupeKey.length > 500) {
    throw new Error("AI Native 产物 taskId/dedupeKey 无效");
  }
  if (draft.kind === "follow_up_draft" &&
      (!draft.subject.trim() || !draft.body.trim() ||
        !Number.isFinite(Date.parse(draft.scheduledFor)))) {
    throw new Error("跟进草稿缺少主题、正文或计划时间");
  }
  if (draft.kind === "interview_brief" &&
      (!draft.title.trim() || !draft.sections.length)) {
    throw new Error("面试简报不能为空");
  }
  if (draft.kind === "strategy_proposal" &&
      (!draft.summary.trim() || !draft.recommendations.length)) {
    throw new Error("策略建议缺少摘要或建议");
  }
  if (draft.kind === "risk_notice" &&
      (!draft.title.trim() || !draft.rationale.trim() || draft.evidenceQuotes.length > 3)) {
    throw new Error("风险提示缺少标题、依据或引用过多");
  }
}
