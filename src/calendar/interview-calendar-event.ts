import { createHash } from "node:crypto";

import type { InterviewRound } from "../tracker/child-types.js";
import type { ApplicationRecord } from "../tracker/types.js";
import type { CalendarEventDraft } from "./calendar-types.js";

type CalendarApplication = Pick<
  ApplicationRecord,
  "id" | "companyName" | "roleName"
>;
type CalendarInterview = Pick<
  InterviewRound,
  "id" | "applicationId" | "roundNumber" | "interviewType" | "scheduledAt" |
  "timezone" | "durationMinutes" | "locationOrLink" | "status"
>;

export type CalendarMappingErrorCode =
  | "application_mismatch"
  | "missing_schedule"
  | "missing_duration"
  | "invalid_timezone"
  | "invalid_deep_link";

export class CalendarMappingError extends Error {
  public constructor(readonly code: CalendarMappingErrorCode, message: string) {
    super(message);
    this.name = "CalendarMappingError";
  }
}

export function interviewCalendarEvent(input: {
  application: CalendarApplication;
  interview: CalendarInterview;
  deepLink: string;
}): CalendarEventDraft {
  const { application, interview } = input;
  if (application.id !== interview.applicationId) {
    throw new CalendarMappingError("application_mismatch", "面试不属于当前投递");
  }
  const start = interview.scheduledAt ? new Date(interview.scheduledAt) : null;
  if (!start || !Number.isFinite(start.getTime())) {
    throw new CalendarMappingError("missing_schedule", "面试时间尚未确认");
  }
  if (!interview.durationMinutes || interview.durationMinutes < 1) {
    throw new CalendarMappingError("missing_duration", "面试时长尚未确认");
  }
  const timezone = interview.timezone.trim();
  if (!validTimezone(timezone)) {
    throw new CalendarMappingError("invalid_timezone", "面试时区无效");
  }
  const deepLink = safeDeepLink(input.deepLink);
  const end = new Date(start.getTime() + interview.durationMinutes * 60_000);
  const place = eventPlace(interview.locationOrLink);
  return {
    sourceId: `coolto:interview:${interview.id}`,
    title: `${application.companyName} · ${application.roleName} · 第 ${interview.roundNumber} 轮${typeLabel(interview.interviewType)}`,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    timezone,
    location: place.location,
    meetingUrl: place.meetingUrl,
    notes: deepLink,
    deepLink,
  };
}

export function calendarEventFingerprint(draft: CalendarEventDraft): string {
  return createHash("sha256").update(JSON.stringify(draft)).digest("hex");
}

function eventPlace(value: string | null): {
  location: string | null;
  meetingUrl: string | null;
} {
  const place = value?.trim() || null;
  if (!place) return { location: null, meetingUrl: null };
  try {
    const url = new URL(place);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) {
      return { location: null, meetingUrl: url.toString() };
    }
  } catch {}
  return { location: place, meetingUrl: null };
}

function safeDeepLink(value: string): string {
  try {
    const url = new URL(value);
    if (!["coolto:", "https:"].includes(url.protocol) || url.username || url.password ||
        value.length > 2_048) throw new Error("invalid");
    return url.toString();
  } catch {
    throw new CalendarMappingError("invalid_deep_link", "Calendar 深链无效");
  }
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function typeLabel(type: CalendarInterview["interviewType"]): string {
  return ({
    phone: "电话面试", video: "视频面试", onsite: "现场面试", hr: "HR 面试",
    technical: "技术面试", case: "案例面试", other: "面试",
  })[type];
}
