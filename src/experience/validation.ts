import type { ExperienceProposalSnapshot } from "./maintenance-types.js";

const CATEGORIES = new Set(["work", "project", "education", "volunteer", "other"]);
const DATE = /^(\d{4})-(0[1-9]|1[0-2])(?:-(\d{2}))?$/;

export type ExperienceValidationField =
  | "category"
  | "title"
  | "content"
  | "organization"
  | "role"
  | "location"
  | "startDate"
  | "endDate"
  | "tags"
  | "status";

export interface ExperienceValidationIssue {
  field: ExperienceValidationField;
  message: string;
}

export function experienceValidationIssues(
  value: ExperienceProposalSnapshot,
): ExperienceValidationIssue[] {
  const issues: ExperienceValidationIssue[] = [];
  if (!CATEGORIES.has(value.category)) add(issues, "category", "经历类别不合法");
  if (!value.title.trim() || length(value.title) > 200) {
    add(issues, "title", "经历标题必须为 1–200 个字符");
  }
  if (!value.content.trim()) add(issues, "content", "经历正文不能为空");
  optional(issues, "organization", value.organization, "组织");
  optional(issues, "role", value.role, "角色");
  optional(issues, "location", value.location, "地点");
  if (value.tags.length > 40) add(issues, "tags", "经历标签不能超过 40 个");
  if (value.tags.some((tag) => !tag.trim() || length(tag) > 80)) {
    add(issues, "tags", "经历标签必须为 1–80 个字符");
  }
  if (value.status !== "active" && value.status !== "archived") {
    add(issues, "status", "经历状态不合法");
  }
  const start = dateBoundary(value.startDate, false, false);
  const end = dateBoundary(value.endDate, true, true);
  if (start.error) add(issues, "startDate", start.error);
  if (end.error) add(issues, "endDate", end.error);
  if (
    !start.error
    && !end.error
    && start.value !== null
    && end.value !== null
    && end.value !== Infinity
    && start.value > end.value
  ) {
    add(issues, "endDate", "结束日期不能早于开始日期");
  }
  return issues;
}

export function validateExperienceSnapshot(
  value: ExperienceProposalSnapshot,
): void {
  const issue = experienceValidationIssues(value)[0];
  if (issue) throw new Error(issue.message);
}

function optional(
  issues: ExperienceValidationIssue[],
  field: "organization" | "role" | "location",
  value: string | null,
  label: string,
): void {
  if (value !== null && length(value) > 200) {
    add(issues, field, `${label}不能超过 200 个字符`);
  }
}

function dateBoundary(
  value: string | null,
  endOfMonth: boolean,
  allowPresent: boolean,
): { value: number | null; error?: string } {
  if (value === null) return { value: null };
  if (allowPresent && value === "present") return { value: Infinity };
  const match = DATE.exec(value);
  if (!match) return { value: null, error: "日期必须使用 YYYY-MM 或 YYYY-MM-DD" };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const rawDay = match[3];
  const day = rawDay
    ? Number(rawDay)
    : endOfMonth ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 1;
  const timestamp = Date.UTC(year, month - 1, day);
  const actual = new Date(timestamp);
  if (
    actual.getUTCFullYear() !== year
    || actual.getUTCMonth() !== month - 1
    || actual.getUTCDate() !== day
  ) {
    return { value: null, error: "日期不是有效日历日期" };
  }
  return { value: timestamp };
}

function add(
  issues: ExperienceValidationIssue[],
  field: ExperienceValidationField,
  message: string,
): void {
  issues.push({ field, message });
}

function length(value: string): number {
  return [...value].length;
}
