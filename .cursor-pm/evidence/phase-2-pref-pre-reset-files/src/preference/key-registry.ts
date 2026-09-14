import {
  PREFERENCE_KEYS,
  type PreferenceKeyV1,
  type PreferenceScopeKind,
  type PreferenceValueV1,
} from "./types.js";

export interface PreferenceKeyDefinition {
  key: PreferenceKeyV1;
  conflictGroup: string;
  ruleVersion: string;
  supportedScopes: readonly PreferenceScopeKind[];
  explanation: string;
}

const DEFINITIONS: Record<PreferenceKeyV1, PreferenceKeyDefinition> = {
  "resume.tone": {
    key: "resume.tone", conflictGroup: "resume.tone", ruleVersion: "resume-tone-v1",
    supportedScopes: ["global", "resume"], explanation: "简历写作语气",
  },
  "resume.bullet_style": {
    key: "resume.bullet_style", conflictGroup: "resume.bullet_style", ruleVersion: "resume-bullet-v1",
    supportedScopes: ["global", "resume"], explanation: "简历 bullet 表达方式",
  },
  "resume.avoid_terms": {
    key: "resume.avoid_terms", conflictGroup: "resume.avoid_terms", ruleVersion: "resume-avoid-terms-v1",
    supportedScopes: ["global", "resume"], explanation: "简历中避免使用的词语",
  },
  "job_search.location_priority": {
    key: "job_search.location_priority", conflictGroup: "job_search.location_priority", ruleVersion: "job-location-v1",
    supportedScopes: ["global", "job_search"], explanation: "岗位搜索地点优先顺序",
  },
  "job_search.work_mode": {
    key: "job_search.work_mode", conflictGroup: "job_search.work_mode", ruleVersion: "job-work-mode-v1",
    supportedScopes: ["global", "job_search"], explanation: "岗位搜索工作方式",
  },
};
export const PREFERENCE_KEY_REGISTRY: Readonly<Record<PreferenceKeyV1, PreferenceKeyDefinition>> = Object.freeze(DEFINITIONS);

const RESUME_TONES = ["standard", "restrained", "direct"] as const;
const BULLET_STYLES = ["concise", "action_first", "metric_first"] as const;
const WORK_MODES = ["onsite", "hybrid", "remote", "flexible"] as const;
const FORBIDDEN_SEMANTIC_TERMS: Record<string, true> = {
  password: true, passcode: true, otp: true, token: true, secret: true, credential: true, "api key": true,
  验证码: true, 密码: true, 口令: true, 密钥: true, 身份证: true, 护照: true, 移民: true, 签证: true, "工作许可": true,
  visa: true, race: true, ethnicity: true, gender: true, sex: true, religion: true, disability: true,
  marital: true, "date of birth": true, "social security": true, salary: true, 薪资: true, 工资: true,
  联系方式: true, 手机号: true, 邮箱: true, email: true, phone: true,
};
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/u;
const PHONE_PATTERN = /(?<![\p{L}\p{N}])\+?\d(?:[\d\s().-]*\d){6,}(?![\p{L}\p{N}])/u;
const JWT_PATTERN = /(?<![\p{L}\p{N}])[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?![\p{L}\p{N}])/u;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/iu;
const API_TOKEN_PATTERN = /\b(?:(?:sk|pk|rk|ghp|github_pat)[_-][A-Za-z0-9._-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|AIza[A-Za-z0-9_-]{30,})\b/iu;
const AWS_ACCESS_KEY_PATTERN = /(?<![A-Z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Z0-9])/u;
const LONG_TOKEN_PATTERN = /(?<![\p{L}])(?:[A-Za-z0-9_-]{32,}|[A-Fa-f0-9]{32,}|[A-Za-z0-9+/]{32,}={0,2})(?![\p{L}])/u;
const CHINESE_ID_PATTERN = /(?<!\d)[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9X](?!\d)/iu;
const SSN_PATTERN = /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/u;
const PASSPORT_PATTERN = /(?<![A-Z0-9])[A-Z][0-9]{7,9}(?![A-Z0-9])/iu;
const SENSITIVE_SHAPE_PATTERNS = [
  EMAIL_PATTERN, PHONE_PATTERN, JWT_PATTERN, BEARER_TOKEN_PATTERN,
  API_TOKEN_PATTERN, AWS_ACCESS_KEY_PATTERN, LONG_TOKEN_PATTERN,
  CHINESE_ID_PATTERN, SSN_PATTERN, PASSPORT_PATTERN,
] as const;

export function isPreferenceKey(value: unknown): value is PreferenceKeyV1 {
  return typeof value === "string" && PREFERENCE_KEYS.includes(value as PreferenceKeyV1);
}

export function preferenceKeyDefinition(key: unknown): PreferenceKeyDefinition {
  if (!isPreferenceKey(key)) throw new Error("Preference key 不在受支持的注册表中");
  return DEFINITIONS[key];
}

export function normalizePreferenceValue(
  key: PreferenceKeyV1,
  value: unknown,
): PreferenceValueV1 {
  const normalized = isListKey(key) ? normalizeTextList(value) : normalizeEnum(key, value);
  assertSafePreferenceValue(normalized);
  return normalized;
}

export function preferenceAllowsScope(
  key: PreferenceKeyV1,
  scopeKind: PreferenceScopeKind,
): boolean {
  return preferenceKeyDefinition(key).supportedScopes.includes(scopeKind);
}

export function assertSafePreferenceValue(value: PreferenceValueV1 | string): void {
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    if (typeof item !== "string" || hasSensitiveShape(item)) {
      throw new Error("Preference 值属于敏感身份、法律或认证信息禁存范围");
    }
  }
}

function hasSensitiveShape(value: string): boolean {
  const normalized = value.normalize("NFKC").trim();
  const normalizedLower = normalized.toLowerCase();
  const semanticTokens = normalizedLower.split(/[^a-z0-9]+/u).filter(Boolean);
  return semanticTokens.some((token) => FORBIDDEN_SEMANTIC_TERMS[token] === true) ||
    FORBIDDEN_SEMANTIC_TERMS[normalizedLower] === true ||
    SENSITIVE_SHAPE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isListKey(key: PreferenceKeyV1): boolean {
  return key === "resume.avoid_terms" || key === "job_search.location_priority";
}

function normalizeEnum(key: PreferenceKeyV1, value: unknown): string {
  if (typeof value !== "string") throw new Error(`${key} 必须是受支持的字符串值`);
  const normalized = value.normalize("NFKC").trim();
  const choices = key === "resume.tone"
    ? RESUME_TONES
    : key === "resume.bullet_style"
      ? BULLET_STYLES
      : WORK_MODES;
  if (!choices.includes(normalized as never)) throw new Error(`${key} 使用了不支持的值`);
  return normalized;
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Preference 列表值必须是字符串数组");
  if (value.length > 20) throw new Error("Preference 列表最多只能有 20 项");
  const normalized = value.map((item) => {
    if (typeof item !== "string") throw new Error("Preference 列表只能包含字符串");
    const text = item.normalize("NFKC").trim();
    if (!text || [...text].length > 120) throw new Error("Preference 列表项不能为空且最多 120 个 Unicode 字符");
    return text;
  });
  if (new Set(normalized).size !== normalized.length) throw new Error("Preference 列表不能有重复值");
  return normalized.sort();
}
