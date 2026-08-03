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
  const sectionKey = normalizeResumeSectionKey(value.sectionKey);
  const sectionLabel = normalizeResumeSectionLabel(value.sectionLabel);
  if (value.coreCategory !== "other" && (sectionKey || sectionLabel)) {
    throw new Error("核心 category 不能附带自定义 section");
  }
  if (value.coreCategory === "other" && Boolean(sectionKey) !== Boolean(sectionLabel)) {
    throw new Error("开放简历 section 必须同时提供 key 和 label");
  }
  if (value.coreCategory === "other") {
    return { coreCategory: value.coreCategory, sectionKey, sectionLabel };
  }
  return { coreCategory: value.coreCategory, sectionKey: null, sectionLabel: null };
}

export function dedupeResumeSkills(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const label = normalizeResumeSectionLabel(value);
    const key = label?.normalize("NFKC").toLocaleLowerCase();
    if (label && key && !seen.has(key)) {
      seen.add(key);
      result.push(label);
    }
  }
  return result;
}

export function normalizeResumeSectionKey(value: string | null | undefined): string | null {
  const cleaned = value?.trim().toLocaleLowerCase();
  if (!cleaned) return null;
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(cleaned)) {
    throw new Error("自定义 section key 必须是 kebab-case");
  }
  return cleaned;
}

export function normalizeResumeSectionLabel(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  if (cleaned && [...cleaned].length > 120) {
    throw new Error("自定义 section label 最长为 120 个字符");
  }
  return cleaned ? cleaned : null;
}
