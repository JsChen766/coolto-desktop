import type { InterviewRound } from "../tracker/child-types.js";
import type { Reminder } from "../tracker/child-types.js";
import type { ApplicationRecord } from "../tracker/types.js";
import {
  CalendarMappingError,
  calendarEventFingerprint,
  interviewCalendarEvent,
} from "./interview-calendar-event.js";
import type {
  CalendarAuthorizationStatus,
  CalendarLink,
  CalendarSyncPlan,
} from "./calendar-types.js";

type CalendarApplication = Pick<ApplicationRecord, "id" | "companyName" | "roleName">;
type CalendarInterview = Pick<
  InterviewRound,
  "id" | "applicationId" | "roundNumber" | "interviewType" | "scheduledAt" |
  "timezone" | "durationMinutes" | "locationOrLink" | "status"
>;

export function planInterviewCalendarSync(input: {
  application: CalendarApplication;
  interview: CalendarInterview;
  deepLink: string;
  authorization: CalendarAuthorizationStatus;
  link: CalendarLink | null;
  reminders?: Array<Pick<Reminder, "interviewRoundId" | "remindAt" | "status">>;
}): CalendarSyncPlan {
  const linkError = validateLink(input.link, input.application.id, input.interview.id);
  if (linkError) return linkError;
  if (input.interview.status === "completed") {
    return { kind: "none", reason: "not_scheduled" };
  }
  if (input.interview.status === "canceled") {
    if (!input.link) return { kind: "none", reason: "not_linked" };
    return existingMutation(input.authorization, input.link, "cancel");
  }

  let draft;
  try {
    draft = interviewCalendarEvent(input);
  } catch (error) {
    const message = error instanceof CalendarMappingError
      ? error.message : "面试 Calendar 信息无效";
    return { kind: "blocked", reason: "invalid_interview", message };
  }
  if (!input.link) return createPlan(input.authorization, draft);
  if (input.link.eventFingerprint === calendarEventFingerprint(draft)) {
    return { kind: "none", reason: "unchanged" };
  }
  return existingMutation(input.authorization, input.link, "update", draft);
}

function createPlan(
  authorization: CalendarAuthorizationStatus,
  draft: ReturnType<typeof interviewCalendarEvent>,
): CalendarSyncPlan {
  if (authorization === "not_determined") return { kind: "request_write_only", draft };
  if (authorization === "write_only" || authorization === "full_access") {
    return { kind: "create", draft };
  }
  return permissionBlock(authorization);
}

function existingMutation(
  authorization: CalendarAuthorizationStatus,
  link: CalendarLink,
  action: "update" | "cancel",
  draft?: ReturnType<typeof interviewCalendarEvent>,
): CalendarSyncPlan {
  if (authorization === "full_access") {
    if (action === "cancel") return { kind: "cancel", link };
    if (draft) return { kind: "update", link, draft };
    return { kind: "blocked", reason: "invalid_interview",
      message: "面试 Calendar 信息无效" };
  }
  if (authorization === "write_only" || authorization === "not_determined") {
    return { kind: "request_full_access", reason: action, link, ...(draft ? { draft } : {}) };
  }
  return permissionBlock(authorization);
}

function permissionBlock(status: CalendarAuthorizationStatus): CalendarSyncPlan {
  if (status === "denied") {
    return { kind: "blocked", reason: "permission_denied",
      message: "系统日历权限已拒绝，Tracker 记录不受影响" };
  }
  if (status === "restricted") {
    return { kind: "blocked", reason: "permission_restricted",
      message: "系统限制了日历权限，Tracker 记录不受影响" };
  }
  return { kind: "blocked", reason: "platform_unavailable",
    message: "当前设备不支持 macOS Calendar 同步" };
}

function validateLink(
  link: CalendarLink | null,
  applicationId: string,
  interviewId: string,
): CalendarSyncPlan | null {
  if (!link || (link.applicationId === applicationId && link.interviewId === interviewId)) {
    if (!link) return null;
    const validEventId = Boolean(link.eventIdentifier.trim());
    const validFingerprint = /^[a-f0-9]{64}$/u.test(link.eventFingerprint);
    if (validEventId && validFingerprint) return null;
  }
  return { kind: "blocked", reason: "invalid_link", message: "Calendar 映射不属于当前面试" };
}
