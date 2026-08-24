import type { AgentHarnessStateRepository } from "./agent-harness-state-repository.js";
import type {
  AnswerVaultCategory,
  AnswerVaultEntryV1,
  AnswerVaultWriteInputV1,
} from "./answer-vault-types.js";
import { canonicalHash } from "./canonical-hash.js";
import type { JsonValue } from "./json-types.js";
import { uuidV7 } from "./uuid-v7.js";

const FORBIDDEN = /(eeo|equal employment|disability|disabled|veteran|race|ethnicity|gender|sex|religion|date of birth|\bdob\b|marital status|password|passcode|otp|one.?time|验证码|密码|残障|退伍|种族|宗教|性别|出生日期|婚姻|身份证|护照|legal attestation|background check|criminal record|signature)/iu;

export class AnswerVaultStore {
  public constructor(
    private readonly ownerId: string,
    private readonly repository: AgentHarnessStateRepository,
  ) {}

  public upsert(input: AnswerVaultWriteInputV1 & {
    confirmedAt: string;
  }): Promise<AnswerVaultEntryV1> {
    validate(input);
    return this.repository.update((state) => {
      const content = {
        category: input.category,
        questionKey: input.questionKey.trim(),
        value: input.value.trim(),
        scopeDomains: normalizeDomains(input.scopeDomains),
        source: "user_confirmed" as const,
        confirmedAt: input.confirmedAt,
        expiresAt: input.expiresAt ?? null,
      };
      const contentHash = canonicalHash(content as unknown as JsonValue);
      const existing = state.answerVault.find((entry) =>
        entry.category === content.category &&
        entry.questionKey === content.questionKey &&
        entry.scopeDomains.join("|") === content.scopeDomains.join("|"),
      );
      if (existing) {
        Object.assign(existing, content, { contentHash });
        return existing;
      }
      const entry: AnswerVaultEntryV1 = {
        version: 1, id: uuidV7(), ownerId: this.ownerId,
        ...content, contentHash,
      };
      state.answerVault.push(entry);
      return entry;
    });
  }

  public async validate(input: AnswerVaultWriteInputV1): Promise<void> {
    validate({ ...input, confirmedAt: new Date().toISOString() });
    normalizeDomains(input.scopeDomains);
  }

  public list(input: {
    category?: AnswerVaultCategory;
    domain?: string;
    now?: number;
  } = {}): Promise<AnswerVaultEntryV1[]> {
    const now = input.now ?? Date.now();
    const domain = input.domain
      ? normalizeDomains([input.domain])[0]
      : undefined;
    return this.repository.read((state) => state.answerVault.filter((entry) =>
      entry.ownerId === this.ownerId &&
      (!input.category || entry.category === input.category) &&
      (!entry.expiresAt || Date.parse(entry.expiresAt) > now) &&
      (!domain || entry.scopeDomains.length === 0 ||
        entry.scopeDomains.some((value) => domain === value || domain.endsWith(`.${value}`))),
    ));
  }
}

function validate(input: AnswerVaultWriteInputV1 & { confirmedAt: string }): void {
  const questionKey = input.questionKey.trim();
  const value = input.value.trim();
  if (!questionKey || !value) throw new Error("Answer Vault 问题和值不能为空");
  if (questionKey.length > 500 || value.length > 2_000) {
    throw new Error("Answer Vault 问题或答案超出长度限制");
  }
  const confirmedAt = Date.parse(input.confirmedAt);
  if (!Number.isFinite(confirmedAt)) throw new Error("Answer Vault 确认时间无效");
  if (input.expiresAt) {
    const expiresAt = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= confirmedAt) {
      throw new Error("Answer Vault 到期时间必须晚于确认时间");
    }
  }
  if (FORBIDDEN.test(`${questionKey}\n${value}`)) {
    throw new Error("该字段属于 EEO/身份/法律/密码/OTP 禁存范围");
  }
}

function normalizeDomains(values: string[]): string[] {
  return [...new Set(values.map((value) => {
    const domain = value.trim().toLowerCase();
    if (!domain || domain.includes("/") || domain.includes(":")) {
      throw new Error(`无效 Answer Vault domain：${value}`);
    }
    return domain;
  }))].sort();
}
