import type { ExperienceProposalSnapshot } from "./maintenance-types.js";

const CATEGORIES = new Set(["work", "project", "education", "volunteer", "other"]);
const DATE = /^(\d{4})-(0[1-9]|1[0-2])(?:-(\d{2}))?$/;

export function validateExperienceSnapshot(
  value: ExperienceProposalSnapshot,
): void {
  if (!CATEGORIES.has(value.category)) invalid("经历类别不合法");
  if (!value.title.trim() || length(value.title) > 200) {
    invalid("经历标题必须为 1–200 个字符");
  }
  if (!value.content.trim()) invalid("经历正文不能为空");
  optional(value.organization, "组织");
  optional(value.role, "角色");
  optional(value.location, "地点");
  if (value.tags.length > 40) invalid("经历标签不能超过 40 个");
  for (const tag of value.tags) {
    if (!tag.trim() || length(tag) > 80) invalid("经历标签必须为 1–80 个字符");
  }
  if (value.status !== "active" && value.status !== "archived") {
    invalid("经历状态不合法");
  }
  const start = dateBoundary(value.startDate, false, false);
  const end = dateBoundary(value.endDate, true, true);
  if (start !== null && end !== null && end !== Infinity && start > end) {
    invalid("结束日期不能早于开始日期");
  }
}

function optional(value: string | null, label: string): void {
  if (value !== null && length(value) > 200) invalid(`${label}不能超过 200 个字符`);
}

function dateBoundary(
  value: string | null,
  endOfMonth: boolean,
  allowPresent: boolean,
): number | null {
  if (value === null) return null;
  if (allowPresent && value === "present") return Infinity;
  const match = DATE.exec(value);
  if (!match) invalid("日期必须使用 YYYY-MM 或 YYYY-MM-DD");
  const year = Number(match![1]);
  const month = Number(match![2]);
  const rawDay = match![3];
  const day = rawDay
    ? Number(rawDay)
    : endOfMonth ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 1;
  const date = Date.UTC(year, month - 1, day);
  const actual = new Date(date);
  if (
    actual.getUTCFullYear() !== year ||
    actual.getUTCMonth() !== month - 1 ||
    actual.getUTCDate() !== day
  ) {
    invalid("日期不是有效日历日期");
  }
  return date;
}

function length(value: string): number {
  return [...value].length;
}

function invalid(message: string): never {
  throw new Error(message);
}
