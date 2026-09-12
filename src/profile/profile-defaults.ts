export const PROFILE_LANGUAGES = ["zh-CN", "en-US"] as const;
export type ProfileLanguage = typeof PROFILE_LANGUAGES[number];

export const PROFILE_RESUME_STYLES = ["standard", "restrained", "direct"] as const;
export type ProfileResumeStyle = typeof PROFILE_RESUME_STYLES[number];

export const PROFILE_CAREER_STAGES = [
  "student", "early_career", "mid_career", "senior", "leadership", "career_change",
] as const;
export type ProfileCareerStage = typeof PROFILE_CAREER_STAGES[number];

export type ProfileDefaultKind = "language" | "resumeStyle";
export type ProfileDefaultState = "missing" | "recognized" | "unrecognized";

export function normalizeProfileLanguage(value: unknown): string {
  return normalizeDefault(value, "zh-CN", "preferredLanguage");
}

export function normalizeProfileResumeStyle(value: unknown): string {
  return normalizeDefault(value, "standard", "resumeStyle");
}

export function normalizeProfileCareerStage(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("careerStage 必须是字符串或 null");
  const normalized = clean(value);
  return normalized || null;
}

export function isProfileLanguage(value: string): value is ProfileLanguage {
  return PROFILE_LANGUAGES.includes(value as ProfileLanguage);
}

export function isProfileResumeStyle(value: string): value is ProfileResumeStyle {
  return PROFILE_RESUME_STYLES.includes(value as ProfileResumeStyle);
}

export function isProfileCareerStage(value: string): value is ProfileCareerStage {
  return PROFILE_CAREER_STAGES.includes(value as ProfileCareerStage);
}

export function profileDefaultState(
  kind: ProfileDefaultKind,
  value: string | null | undefined,
): ProfileDefaultState {
  if (!value?.trim()) return "missing";
  if (kind === "language") return isProfileLanguage(clean(value)) ? "recognized" : "unrecognized";
  return isProfileResumeStyle(clean(value)) ? "recognized" : "unrecognized";
}

export function profileDefaultLabel(
  kind: ProfileDefaultKind,
  value: string | null | undefined,
): string {
  const normalized = value?.trim() ?? "";
  return profileDefaultState(kind, normalized) === "recognized"
    ? normalized
    : normalized ? "未识别" : "未设置";
}

export function profileCareerStageLabel(value: string | null | undefined): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "未设置";
  return isProfileCareerStage(clean(normalized)) ? normalized : "未识别";
}

export function assertSupportedProfileWrite(
  value: unknown,
  kind: ProfileDefaultKind,
): ProfileLanguage | ProfileResumeStyle {
  if (typeof value !== "string") throw new Error(`${kind} 必须使用受支持的字符串值`);
  const normalized = clean(value);
  const supported = kind === "language" ? isProfileLanguage(normalized) : isProfileResumeStyle(normalized);
  if (!supported) throw new Error(`${kind} 使用了不支持的新值`);
  return normalized as ProfileLanguage | ProfileResumeStyle;
}

function normalizeDefault(value: unknown, fallback: string, field: string): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") throw new Error(`${field} 必须是字符串或 null`);
  return clean(value) || fallback;
}

function clean(value: string): string {
  return value.normalize("NFKC").trim();
}
