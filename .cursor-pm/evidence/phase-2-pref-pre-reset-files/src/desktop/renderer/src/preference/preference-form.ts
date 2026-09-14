import {
  PREFERENCE_KEYS,
  type PreferenceKeyV1,
  type PreferenceMutationInputV1,
  type PreferenceScopeKind,
  type PreferenceValueV1,
} from "../../../../preference/types.js";
import { preferenceAllowsScope } from "../../../../preference/key-registry.js";
import type { PreferenceDesktopView } from "../../../shared/types/preferences.js";

export interface PreferenceFormDraft {
  key: PreferenceKeyV1;
  value: string;
  scopeKind: PreferenceScopeKind;
  targetFingerprint: string;
  domain: string;
  priority: string;
}
export type PreferenceFormErrors = Partial<Record<keyof PreferenceFormDraft, string>>;

export const PREFERENCE_FORM_KEYS: readonly PreferenceKeyV1[] = PREFERENCE_KEYS;
export const PREFERENCE_FORM_SCOPES: readonly PreferenceScopeKind[] = [
  "global", "resume", "job_search", "browser_fill", "interview",
];
export function preferenceScopesForKey(key: PreferenceKeyV1): readonly PreferenceScopeKind[] {
  return PREFERENCE_FORM_SCOPES.filter((scope) => preferenceAllowsScope(key, scope));
}

export function preferenceDraft(item?: PreferenceDesktopView): PreferenceFormDraft {
  return {
    key: item?.key ?? "resume.tone",
    value: item ? valueText(item.value) : "restrained",
    scopeKind: item?.scope.kind ?? "global",
    targetFingerprint: item?.scope.targetFingerprint ?? "",
    domain: item?.scope.domain ?? "",
    priority: item ? String(item.priority) : "50",
  };
}

export function preferenceFormErrors(draft: PreferenceFormDraft): PreferenceFormErrors {
  const errors: Partial<Record<keyof PreferenceFormDraft, string>> = {};
  if (!PREFERENCE_KEYS.includes(draft.key)) errors.key = "偏好类型无效";
  if (!draft.value.trim()) errors.value = "偏好值不能为空";
  if (!preferenceAllowsScope(draft.key, draft.scopeKind)) errors.scopeKind = "偏好类型不支持该作用域";
  if (draft.scopeKind === "browser_fill" && !draft.domain.trim()) errors.domain = "浏览器作用域需要精确域名";
  if (draft.targetFingerprint.trim() &&
      !/^[0-9a-f]{64}$/u.test(draft.targetFingerprint.trim())) {
    errors.targetFingerprint = "目标指纹必须是 64 位十六进制值";
  }
  return errors;
}

export function preferenceInput(draft: PreferenceFormDraft): PreferenceMutationInputV1 {
  const value = listKey(draft.key)
    ? draft.value.split(/[,，\n]/u).map((item) => item.trim()).filter(Boolean)
    : draft.value.trim();
  return {
    key: draft.key, value, priority: Number(draft.priority),
    scope: {
      kind: draft.scopeKind,
      ...(draft.scopeKind === "browser_fill" && draft.domain.trim()
        ? { domain: draft.domain.trim().toLowerCase() } : {}),
      ...(draft.scopeKind !== "global" && draft.scopeKind !== "browser_fill" && draft.targetFingerprint.trim()
        ? { targetFingerprint: draft.targetFingerprint.trim() } : {}),
    },
  } as PreferenceMutationInputV1;
}

export function valueText(value: PreferenceValueV1): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

export function scopeText(item: Pick<PreferenceDesktopView, "scope">): string {
  if (item.scope.kind === "global") return "全局";
  if (item.scope.kind === "browser_fill") return `浏览器：${item.scope.domain ?? "精确域名"}`;
  return item.scope.targetFingerprint ? `${item.scope.kind} · 当前目标` : item.scope.kind;
}

export function keyText(key: PreferenceKeyV1): string {
  return {
    "resume.tone": "简历语气", "resume.bullet_style": "Bullet 表达方式",
    "resume.avoid_terms": "简历避免词", "job_search.location_priority": "岗位地点优先级",
    "job_search.work_mode": "工作方式",
  }[key];
}

function listKey(key: PreferenceKeyV1): boolean {
  return key === "resume.avoid_terms" || key === "job_search.location_priority";
}
