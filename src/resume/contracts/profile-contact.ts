export interface ResumeContactFields {
  fullName: string | null;
  phone: string | null;
  contactEmail: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  personalWebsite: string | null;
}

export type ResumeContactField = keyof ResumeContactFields;

const REQUIRED: readonly ResumeContactField[] = [
  "fullName",
  "phone",
  "contactEmail",
];

export function normalizeResumeContact(
  value: ResumeContactFields,
): ResumeContactFields {
  return {
    fullName: cleanText(value.fullName),
    phone: cleanText(value.phone),
    contactEmail: normalizeEmail(value.contactEmail),
    location: cleanText(value.location),
    linkedinUrl: normalizeHttpsUrl(value.linkedinUrl),
    githubUrl: normalizeHttpsUrl(value.githubUrl),
    personalWebsite: normalizeHttpsUrl(value.personalWebsite),
  };
}

export function missingResumeContactFields(
  value: ResumeContactFields,
): ResumeContactField[] {
  const normalized = normalizeResumeContact(value);
  return REQUIRED.filter((field) => !normalized[field]);
}

export function isResumeContactComplete(value: ResumeContactFields): boolean {
  return missingResumeContactFields(value).length === 0;
}

export function normalizedPhoneComparisonValue(value: string | null): string | null {
  const displayValue = cleanText(value);
  if (!displayValue) return null;
  return displayValue.replace(/[\s().-]/gu, "");
}

function cleanText(value: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function normalizeEmail(value: string | null): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(cleaned)) {
    throw new Error("简历联系邮箱格式无效");
  }
  return cleaned;
}

function normalizeHttpsUrl(value: string | null): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new Error("网址必须是完整 https:// URL");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname) {
    throw new Error("网址必须是完整 https:// URL");
  }
  return cleaned;
}
