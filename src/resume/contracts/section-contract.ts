export type ResumeCoreCategory =
  | "education"
  | "work"
  | "project"
  | "volunteer"
  | "other";

export interface ResumeSectionDescriptor {
  coreCategory: ResumeCoreCategory;
  sectionKey: string | null;
  sectionLabel: string | null;
}

export const RESUME_SECTION_ORDER = [
  "education",
  "work",
  "project",
  "other",
  "skills",
] as const;

export function normalizeResumeSection(
  value: ResumeSectionDescriptor,
): ResumeSectionDescriptor {
  const sectionKey = cleanKey(value.sectionKey);
  const sectionLabel = cleanText(value.sectionLabel);
  if (value.coreCategory === "other") {
    if (!sectionKey || !sectionLabel) {
      throw new Error("开放简历 section 必须同时提供 key 和 label");
    }
    return { coreCategory: value.coreCategory, sectionKey, sectionLabel };
  }
  if (sectionKey || sectionLabel) {
    throw new Error("核心 category 不能附带自定义 section");
  }
  return { coreCategory: value.coreCategory, sectionKey: null, sectionLabel: null };
}

export function dedupeResumeSkills(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const label = cleanText(value);
    const key = label?.toLocaleLowerCase();
    if (label && key && !seen.has(key)) {
      seen.add(key);
      result.push(label);
    }
  }
  return result;
}

function cleanKey(value: string | null): string | null {
  const cleaned = value?.trim().toLocaleLowerCase();
  if (!cleaned) return null;
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(cleaned)) {
    throw new Error("自定义 section key 必须是 kebab-case");
  }
  return cleaned;
}

function cleanText(value: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}
