export const ANSWER_VAULT_CATEGORIES = [
  "work_authorization", "visa", "relocation", "languages",
  "availability", "salary_range",
] as const;

export type AnswerVaultCategory = typeof ANSWER_VAULT_CATEGORIES[number];

export function isAnswerVaultCategory(
  value: unknown,
): value is AnswerVaultCategory {
  return typeof value === "string" &&
    ANSWER_VAULT_CATEGORIES.includes(value as AnswerVaultCategory);
}

export interface AnswerVaultWriteInputV1 {
  category: AnswerVaultCategory;
  questionKey: string;
  value: string;
  scopeDomains: string[];
  expiresAt?: string | null;
}

export interface AnswerVaultEntryV1 {
  version: 1;
  id: string;
  ownerId: string;
  category: AnswerVaultCategory;
  questionKey: string;
  value: string;
  scopeDomains: string[];
  source: "user_confirmed";
  confirmedAt: string;
  expiresAt: string | null;
  contentHash: string;
}
