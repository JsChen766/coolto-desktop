import type { ApprovalDraft } from "../approvals/types.js";
import { canonicalHash } from "./canonical-hash.js";
import type { AnswerVaultWriteInputV1 } from "./answer-vault-types.js";
import type { JsonValue } from "./json-types.js";

export const ANSWER_VAULT_UPSERT_ACTION = "answer_vault.upsert";

export function createAnswerVaultApprovalDraft(
  input: AnswerVaultWriteInputV1,
): ApprovalDraft {
  const scope = {
    category: input.category,
    questionKey: input.questionKey.trim(),
    scopeDomains: [...input.scopeDomains].sort(),
  };
  return {
    actionType: ANSWER_VAULT_UPSERT_ACTION,
    scopeKey: `answer-vault:${canonicalHash(scope as unknown as JsonValue)}`,
    risk: "sensitive",
    title: "保存到 Answer Vault",
    description: "仅在你接受后，将这条常用求职事实写入本机加密存储。",
    preview: {
      summary: [
        { label: "类别", value: input.category },
        { label: "问题", value: input.questionKey.trim() },
        { label: "答案", value: input.value.trim() },
        {
          label: "适用站点",
          value: input.scopeDomains.length ? input.scopeDomains.join("、") : "所有已授权站点",
        },
        { label: "到期时间", value: input.expiresAt ?? "不过期" },
      ],
      warnings: [
        "EEO、残障、退伍军人、种族、宗教、性别、身份、法律声明、密码和 OTP 不会保存。",
      ],
    },
  };
}
