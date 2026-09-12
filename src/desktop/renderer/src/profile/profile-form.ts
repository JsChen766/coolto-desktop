import type { UserProfile } from "../../../../api/types.js";
import {
  careerTargetFingerprint,
  legacyToCareerTargets,
  type CareerTargetV1,
} from "../../../../profile/career-targets.js";
import type { ProfileChangeSet, ProfileContactUpdate } from "../../../../profile/types.js";
import {
  normalizeResumeContact,
  type ResumeContactField,
  type ResumeContactFields,
} from "../../../../resume/contracts/profile-contact.js";

export interface ProfileTargetDraft {
  id: string;
  idKind: "opaque" | "legacy_compatibility";
  role: string;
  industries: string;
  locations: string;
  isPrimary: boolean;
}

export interface ProfileFormDraft {
  fullName: string;
  phone: string;
  contactEmail: string;
  location: string;
  linkedinUrl: string;
  githubUrl: string;
  personalWebsite: string;
  currentTitle: string;
  currentCompany: string;
  yearsOfExperience: string;
  careerStage: string;
  preferredLanguage: string;
  resumeStyle: string;
  careerTargets: ProfileTargetDraft[];
}
export type ProfileFormErrors = Partial<Record<keyof ProfileFormDraft, string>>;

export interface ProfileFormField {
  key: ResumeContactField;
  label: string;
  required: boolean;
  autocomplete: string;
  type?: "email" | "tel" | "url";
}

export const PROFILE_FORM_FIELDS: readonly ProfileFormField[] = [
  { key: "fullName", label: "姓名", required: true, autocomplete: "name" },
  { key: "phone", label: "电话", required: true, autocomplete: "tel", type: "tel" },
  { key: "contactEmail", label: "简历联系邮箱", required: true, autocomplete: "email", type: "email" },
  { key: "location", label: "所在地", required: false, autocomplete: "address-level2" },
  { key: "linkedinUrl", label: "LinkedIn", required: false, autocomplete: "url", type: "url" },
  { key: "githubUrl", label: "GitHub", required: false, autocomplete: "url", type: "url" },
  { key: "personalWebsite", label: "个人网站", required: false, autocomplete: "url", type: "url" },
];

export function profileDraft(profile: UserProfile): ProfileFormDraft {
  const targets = profile.careerTargets ?? legacyDraftTargets(profile);
  return {
    fullName: profile.fullName ?? "", phone: profile.phone ?? "",
    contactEmail: profile.contactEmail ?? "", location: profile.location ?? "",
    linkedinUrl: profile.linkedinUrl ?? "", githubUrl: profile.githubUrl ?? "",
    personalWebsite: profile.personalWebsite ?? "", currentTitle: profile.currentTitle ?? "",
    currentCompany: profile.currentCompany ?? "",
    yearsOfExperience: profile.yearsOfExperience === null || profile.yearsOfExperience === undefined ? "" : String(profile.yearsOfExperience),
    careerStage: profile.careerStage ?? "", preferredLanguage: profile.preferredLanguage ?? "zh-CN",
    resumeStyle: profile.resumeStyle ?? "standard", careerTargets: targets.map(toTargetDraft),
  };
}

export function profileFormErrors(draft: ProfileFormDraft): ProfileFormErrors {
  const errors: ProfileFormErrors = {};
  for (const field of PROFILE_FORM_FIELDS) {
    if (field.required && !draft[field.key].trim()) errors[field.key] = "此项为必填项";
  }
  try { profileContactFields(draft); } catch (error) {
    const message = error instanceof Error ? error.message : "个人信息格式无效";
    const key = message.includes("邮箱") ? "contactEmail"
      : message.includes("网址") ? firstInvalidUrl(draft) : "fullName";
    errors[key] = message;
  }
  if (draft.yearsOfExperience?.trim()) {
    const years = Number(draft.yearsOfExperience);
    if (!Number.isInteger(years) || years < 0 || years > 80) {
      errors.yearsOfExperience = "工作年限必须是 0 到 80 的整数";
    }
  }
  try { normalizeProfileTargets(draft.careerTargets ?? []); } catch (error) {
    errors.careerTargets = error instanceof Error ? error.message : "求职目标格式无效";
  }
  return errors;
}

export function profileContactChanges(before: ProfileFormDraft, after: ProfileFormDraft): ProfileContactUpdate {
  const current = profileContactFields(before); const next = profileContactFields(after);
  return Object.fromEntries(PROFILE_FORM_FIELDS.filter((field) => current[field.key] !== next[field.key]).map((field) => [field.key, next[field.key]])) as ProfileContactUpdate;
}

export function profileChanges(before: ProfileFormDraft, after: ProfileFormDraft): ProfileChangeSet {
  const changes: ProfileChangeSet = { ...profileContactChanges(before, after) };
  const currentTargets = normalizeProfileTargets(before.careerTargets ?? []);
  const nextTargets = normalizeProfileTargets(after.careerTargets ?? []);
  if (JSON.stringify(currentTargets) !== JSON.stringify(nextTargets)) changes.careerTargets = nextTargets;
  if (clean(before.currentTitle) !== clean(after.currentTitle)) changes.currentTitle = clean(after.currentTitle);
  if (clean(before.currentCompany) !== clean(after.currentCompany)) changes.currentCompany = clean(after.currentCompany);
  if (parseYears(before.yearsOfExperience) !== parseYears(after.yearsOfExperience)) changes.yearsOfExperience = parseYears(after.yearsOfExperience);
  if (clean(before.careerStage) !== clean(after.careerStage)) changes.careerStage = clean(after.careerStage);
  if (before.preferredLanguage !== after.preferredLanguage) changes.preferredLanguage = after.preferredLanguage;
  if (before.resumeStyle !== after.resumeStyle) changes.resumeStyle = after.resumeStyle;
  return changes;
}

export function profileContactFields(draft: ProfileFormDraft): ResumeContactFields {
  return normalizeResumeContact({ fullName: draft.fullName, phone: draft.phone, contactEmail: draft.contactEmail, location: draft.location, linkedinUrl: draft.linkedinUrl, githubUrl: draft.githubUrl, personalWebsite: draft.personalWebsite });
}
export function cloneProfileDraft(draft: ProfileFormDraft): ProfileFormDraft {
  return {
    ...draft,
    careerTargets: draft.careerTargets.map((target) => ({ ...target })),
  };
}

export function profileDraftEqual(left: ProfileFormDraft, right: ProfileFormDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeProfileTargets(drafts: readonly ProfileTargetDraft[]): CareerTargetV1[] {
  if (drafts.length > 20) throw new Error("求职目标最多只能有 20 个");
  const targets = drafts.map((draft) => ({
    id: draft.id || crypto.randomUUID(), idKind: draft.idKind ?? "opaque" as const,
    role: clean(draft.role), industries: list(draft.industries), locations: list(draft.locations), isPrimary: draft.isPrimary,
  }));
  for (const target of targets) {
    if (target.idKind === "legacy_compatibility" &&
        target.id !== `legacy:${careerTargetFingerprint(target)}`) {
      target.id = crypto.randomUUID();
      target.idKind = "opaque";
    }
  }
  const identities = targets.map((target) => JSON.stringify({ role: target.role, industries: target.industries, locations: target.locations }));
  if (identities.some((value, index) => identities.indexOf(value) !== index)) throw new Error("求职目标不能重复");
  if (targets.filter((target) => target.isPrimary).length > 1) throw new Error("求职目标最多只能有一个主要目标");
  if (targets.some((target) => !target.role && !target.industries.length && !target.locations.length)) throw new Error("每个求职目标至少需要岗位、行业或地点之一");
  return targets;
}

function legacyDraftTargets(profile: UserProfile): CareerTargetV1[] {
  return legacyToCareerTargets({
    targetRoles: profile.targetRoles ?? [],
    targetIndustries: profile.targetIndustries ?? [],
    targetLocations: profile.targetLocations ?? [],
  }).map((target) => ({ ...target, isPrimary: false }));
}

function toTargetDraft(target: CareerTargetV1): ProfileTargetDraft {
  return { id: target.id, idKind: target.idKind, role: target.role ?? "", industries: target.industries.join(", "), locations: target.locations.join(", "), isPrimary: target.isPrimary };
}
function list(value: string): string[] { return value.split(/[,，\n]/u).map((item) => item.normalize("NFKC").trim()).filter(Boolean); }
function clean(value: string | undefined): string | null { const result = value?.normalize("NFKC").trim() ?? ""; return result || null; }
function parseYears(value: string | undefined): number | null { const text = value?.trim() ?? ""; return text ? Number(text) : null; }
function firstInvalidUrl(draft: ProfileFormDraft): ResumeContactField { return (["linkedinUrl", "githubUrl", "personalWebsite"] as const).find((key) => draft[key].trim() && !draft[key].trim().startsWith("https://")) ?? "linkedinUrl"; }
