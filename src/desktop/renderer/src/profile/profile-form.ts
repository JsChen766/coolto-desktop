import type { UserProfile } from "../../../../api/types.js";
import type { ProfileContactUpdate } from "../../../../profile/types.js";
import {
  normalizeResumeContact,
  type ResumeContactField,
  type ResumeContactFields,
} from "../../../../resume/contracts/profile-contact.js";

export interface ProfileFormDraft {
  fullName: string;
  phone: string;
  contactEmail: string;
  location: string;
  linkedinUrl: string;
  githubUrl: string;
  personalWebsite: string;
}

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
  return {
    fullName: profile.fullName ?? "", phone: profile.phone ?? "",
    contactEmail: profile.contactEmail ?? "", location: profile.location ?? "",
    linkedinUrl: profile.linkedinUrl ?? "", githubUrl: profile.githubUrl ?? "",
    personalWebsite: profile.personalWebsite ?? "",
  };
}

export function profileFormErrors(draft: ProfileFormDraft): Partial<Record<ResumeContactField, string>> {
  const errors: Partial<Record<ResumeContactField, string>> = {};
  for (const field of PROFILE_FORM_FIELDS) {
    if (field.required && !draft[field.key].trim()) errors[field.key] = "此项为必填项";
  }
  try {
    profileContactFields(draft);
  } catch (error) {
    const message = error instanceof Error ? error.message : "个人信息格式无效";
    const key = message.includes("邮箱") ? "contactEmail"
      : message.includes("网址") ? firstInvalidUrl(draft) : "fullName";
    if (!errors[key]) errors[key] = message;
  }
  return errors;
}

export function profileContactChanges(
  before: ProfileFormDraft,
  after: ProfileFormDraft,
): ProfileContactUpdate {
  const current = profileContactFields(before);
  const next = profileContactFields(after);
  return Object.fromEntries(
    PROFILE_FORM_FIELDS
      .filter((field) => current[field.key] !== next[field.key])
      .map((field) => [field.key, next[field.key]]),
  ) as ProfileContactUpdate;
}

export function profileContactFields(draft: ProfileFormDraft): ResumeContactFields {
  return normalizeResumeContact({
    fullName: draft.fullName, phone: draft.phone, contactEmail: draft.contactEmail,
    location: draft.location, linkedinUrl: draft.linkedinUrl, githubUrl: draft.githubUrl,
    personalWebsite: draft.personalWebsite,
  });
}

export function profileDraftEqual(left: ProfileFormDraft, right: ProfileFormDraft): boolean {
  return PROFILE_FORM_FIELDS.every((field) => left[field.key] === right[field.key]);
}

function firstInvalidUrl(draft: ProfileFormDraft): ResumeContactField {
  return (["linkedinUrl", "githubUrl", "personalWebsite"] as const)
    .find((key) => draft[key].trim() && !draft[key].trim().startsWith("https://"))
    ?? "linkedinUrl";
}
