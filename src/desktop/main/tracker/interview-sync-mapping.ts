import type { InterviewInput, InterviewRound } from "../../../tracker/child-types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import {
  childBase, dateString, enumValue, integer, nullableDate, nullableInteger,
  nullableString, requiredString,
} from "./tracker-mapping-utils.js";

const TYPES = ["phone", "video", "onsite", "hr", "technical", "case", "other"] as const;
const STATUSES = ["scheduled", "completed", "canceled"] as const;

export function toInterview(entity: LocalEntity): InterviewRound {
  const value = entity.payload;
  return {
    ...childBase(entity),
    roundNumber: integer(value.roundNumber, "interview.roundNumber", 1),
    interviewType: enumValue(value.interviewType, TYPES, "interview.interviewType"),
    scheduledAt: nullableDate(value.scheduledAt, "interview.scheduledAt"),
    timezone: requiredString(value.timezone, "interview.timezone"),
    durationMinutes: nullableInteger(value.durationMinutes, "interview.durationMinutes"),
    locationOrLink: nullableString(value.locationOrLink, "interview.locationOrLink"),
    interviewer: nullableString(value.interviewer, "interview.interviewer"),
    status: enumValue(value.status, STATUSES, "interview.status"),
  };
}

export function validateInterview(input: InterviewInput): InterviewInput {
  const timezone = input.timezone.trim();
  if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1) throw new Error("面试轮次必须大于 0");
  if (!TYPES.includes(input.interviewType)) throw new Error("面试类型无效");
  if (!STATUSES.includes(input.status)) throw new Error("面试状态无效");
  if (!timezone || timezone.length > 64) throw new Error("面试时区无效");
  if (input.scheduledAt && !Number.isFinite(Date.parse(input.scheduledAt))) throw new Error("面试时间无效");
  if (input.durationMinutes != null && (
    !Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 1440
  )) throw new Error("面试时长必须为 1–1440 分钟");
  return { ...input, timezone };
}

export function interviewWritePayload(applicationId: string, input: InterviewInput) {
  const value = validateInterview(input);
  return {
    applicationId, roundNumber: value.roundNumber, interviewType: value.interviewType,
    scheduledAt: value.scheduledAt ?? null, timezone: value.timezone,
    durationMinutes: value.durationMinutes ?? null,
    locationOrLink: value.locationOrLink?.trim() || null,
    interviewer: value.interviewer?.trim() || null, status: value.status,
  };
}

export function localInterview(
  id: string, applicationId: string, input: InterviewInput, now: string,
  previous?: InterviewRound,
): Record<string, unknown> {
  return {
    id, ...interviewWritePayload(applicationId, input), entityVersion: previous?.entityVersion ?? 1,
    createdAt: previous?.createdAt ?? dateString(now, "now"), updatedAt: now,
  };
}

