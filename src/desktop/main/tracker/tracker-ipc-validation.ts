import type { InterviewInput, NoteInput, ReminderInput } from "../../../tracker/child-types.js";

const INTERVIEW_TYPES = new Set([
  "phone", "video", "onsite", "hr", "technical", "case", "other",
]);
const INTERVIEW_STATUSES = new Set(["scheduled", "completed", "canceled"]);
const NOTE_TYPES = new Set(["general", "interview", "follow_up", "company"]);
const REMINDER_STATUSES = new Set(["scheduled", "delivered", "dismissed", "canceled"]);

export function strictRecord(
  value: unknown,
  allowed: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 无效`);
  }
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label} 包含未知字段：${unknown}`);
  return record;
}

export function requiredId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 不能为空`);
  return value.trim();
}

export function childRequest(value: unknown, valueFields: readonly string[]): {
  applicationId?: string | undefined;
  id?: string | undefined;
  value: Record<string, unknown>;
} {
  const outer = strictRecord(value, ["applicationId", "id", "value"], "Tracker 请求");
  const inner = strictRecord(outer.value, valueFields, "Tracker 内容");
  return {
    applicationId: outer.applicationId === undefined
      ? undefined : requiredId(outer.applicationId, "applicationId"),
    id: outer.id === undefined ? undefined : requiredId(outer.id, "id"),
    value: inner,
  };
}

export function validateInterviewInput(raw: Record<string, unknown>): InterviewInput {
  const result: InterviewInput = {
    roundNumber: requiredPositiveInt(raw.roundNumber, "roundNumber"),
    interviewType: enumValue(raw.interviewType, INTERVIEW_TYPES, "interviewType"),
    timezone: requiredString(raw.timezone, "timezone"),
    status: enumValue(raw.status, INTERVIEW_STATUSES, "status"),
  };
  if (raw.scheduledAt !== undefined) result.scheduledAt = nullableString(raw.scheduledAt, "scheduledAt");
  if (raw.durationMinutes !== undefined) result.durationMinutes = nullablePositiveInt(raw.durationMinutes, "durationMinutes", 1440);
  if (raw.locationOrLink !== undefined) result.locationOrLink = nullableString(raw.locationOrLink, "locationOrLink");
  if (raw.interviewer !== undefined) result.interviewer = nullableString(raw.interviewer, "interviewer");
  return result;
}

export function validateNoteInput(raw: Record<string, unknown>): NoteInput {
  const result: NoteInput = {
    noteType: enumValue(raw.noteType, NOTE_TYPES, "noteType"),
    content: requiredString(raw.content, "content"),
  };
  if (raw.interviewRoundId !== undefined) result.interviewRoundId = nullableString(raw.interviewRoundId, "interviewRoundId");
  return result;
}

export function validateReminderInput(raw: Record<string, unknown>): ReminderInput {
  const result: ReminderInput = {
    title: requiredString(raw.title, "title"),
    remindAt: requiredString(raw.remindAt, "remindAt"),
    status: enumValue(raw.status, REMINDER_STATUSES, "status"),
  };
  if (raw.interviewRoundId !== undefined) result.interviewRoundId = nullableString(raw.interviewRoundId, "interviewRoundId");
  if (raw.deliveredAt !== undefined) result.deliveredAt = nullableString(raw.deliveredAt, "deliveredAt");
  return result;
}

export function recoveryRequest(value: unknown): {
  entityType: "application" | "interview_round" | "application_note" | "reminder";
  entityId: string;
  action: "accept_server" | "reapply";
} {
  const input = strictRecord(value, ["entityType", "entityId", "action"], "同步恢复请求");
  const entityType = requiredString(input.entityType, "entityType");
  const action = requiredString(input.action, "action");
  if (!["application", "interview_round", "application_note", "reminder"].includes(entityType)) {
    throw new Error("同步实体类型无效");
  }
  if (action !== "accept_server" && action !== "reapply") throw new Error("同步恢复操作无效");
  return {
    entityType: entityType as "application" | "interview_round" | "application_note" | "reminder",
    entityId: requiredId(input.entityId, "entityId"), action,
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} 必须是字符串`);
  if (!value.trim()) throw new Error(`${label} 不能为空`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${label} 必须是字符串或 null`);
  return value;
}

function requiredPositiveInt(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} 必须是正整数`);
  }
  return value as number;
}

function nullablePositiveInt(value: unknown, label: string, max: number): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max) {
    throw new Error(`${label} 必须是 1–${max} 的正整数或 null`);
  }
  return value as number;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): T {
  const s = requiredString(value, label);
  if (!allowed.has(s)) throw new Error(`${label} 不合法`);
  return s as T;
}
