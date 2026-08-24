import type { ActionExecutor } from "../approvals/executor-registry.js";
import type { AnswerVaultStore } from "./answer-vault-store.js";
import {
  isAnswerVaultCategory,
  type AnswerVaultWriteInputV1,
} from "./answer-vault-types.js";

export function createAnswerVaultApprovalExecutor(
  store: AnswerVaultStore,
): ActionExecutor {
  return {
    execute: async ({ payload }) => {
      const input = readPayload(payload);
      const entry = await store.upsert({
        ...input,
        confirmedAt: new Date().toISOString(),
      });
      return {
        summary: "Answer Vault 已保存用户确认的求职事实。",
        details: {
          answerVaultEntryId: entry.id,
          category: entry.category,
          scopeDomains: entry.scopeDomains,
          confirmedAt: entry.confirmedAt,
          contentHash: entry.contentHash,
        },
      };
    },
  };
}

function readPayload(value: unknown): AnswerVaultWriteInputV1 {
  if (!value || typeof value !== "object") throw new Error("Answer Vault approval payload 无效");
  const input = value as Record<string, unknown>;
  if (!isAnswerVaultCategory(input.category) ||
      typeof input.questionKey !== "string" ||
      typeof input.value !== "string" ||
      !Array.isArray(input.scopeDomains) ||
      !input.scopeDomains.every((domain) => typeof domain === "string") ||
      !(input.expiresAt === undefined || input.expiresAt === null ||
        typeof input.expiresAt === "string")) {
    throw new Error("Answer Vault approval payload 无效");
  }
  return {
    category: input.category,
    questionKey: input.questionKey,
    value: input.value,
    scopeDomains: input.scopeDomains as string[],
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt as string | null }),
  };
}
