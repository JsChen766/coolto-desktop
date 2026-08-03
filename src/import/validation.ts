import type {
  ExperienceCategory,
  ExperienceCreateInput,
} from "../api/types.js";
import type { ExperienceImportCandidate } from "./types.js";
import { normalizeResumeSection } from "../resume/contracts/section-contract.js";

const CATEGORIES = new Set<ExperienceCategory>([
  "work",
  "project",
  "education",
  "volunteer",
  "other",
]);

export function normalizeImportCandidate(
  input: ExperienceCreateInput,
  clientId: string,
): ExperienceImportCandidate {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) {
    throw new Error("每条候选经历都必须包含 title 和 content");
  }
  if (!CATEGORIES.has(input.category)) {
    throw new Error(`不支持的经历类别：${String(input.category)}`);
  }

  const section = normalizeResumeSection({
    coreCategory: input.category,
    sectionKey: input.resumeSectionKey ?? null,
    sectionLabel: input.resumeSectionLabel ?? null,
  });
  return {
    clientId,
    category: input.category,
    title,
    content,
    ...(cleanOptional(input.organization)
      ? { organization: cleanOptional(input.organization)! }
      : {}),
    ...(cleanOptional(input.role)
      ? { role: cleanOptional(input.role)! }
      : {}),
    ...(cleanOptional(input.location)
      ? { location: cleanOptional(input.location)! }
      : {}),
    ...(normalizeDate(input.startDate, false)
      ? { startDate: normalizeDate(input.startDate, false)! }
      : {}),
    ...(normalizeDate(input.endDate, true)
      ? { endDate: normalizeDate(input.endDate, true)! }
      : {}),
    tags: [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))].slice(
      0,
      20,
    ),
    ...(section.sectionKey ? { resumeSectionKey: section.sectionKey } : {}),
    ...(section.sectionLabel ? { resumeSectionLabel: section.sectionLabel } : {}),
  };
}

function cleanOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeDate(
  value: string | undefined,
  allowPresent: boolean,
): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (allowPresent && normalized === "present") {
    return "present";
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(normalized)) {
    throw new Error(`日期格式无效：${value}，应使用 YYYY-MM、YYYY-MM-DD 或 present`);
  }
  return normalized;
}
