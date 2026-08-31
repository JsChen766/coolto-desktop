export type CalendarAuthorizationStatus =
  | "not_determined"
  | "write_only"
  | "full_access"
  | "denied"
  | "restricted"
  | "unavailable";

export interface CalendarEventDraft {
  sourceId: string;
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
  location: string | null;
  meetingUrl: string | null;
  notes: string;
  deepLink: string;
}

export interface CalendarLink {
  applicationId: string;
  interviewId: string;
  eventIdentifier: string;
  calendarIdentifier: string | null;
  eventFingerprint: string;
  createdAt: string;
  updatedAt: string;
}

export type CalendarBlockedReason =
  | "permission_denied"
  | "permission_restricted"
  | "platform_unavailable"
  | "invalid_interview"
  | "invalid_link";

export type CalendarSyncPlan =
  | { kind: "none"; reason: "not_scheduled" | "not_linked" | "unchanged" }
  | { kind: "request_write_only"; draft: CalendarEventDraft }
  | { kind: "create"; draft: CalendarEventDraft }
  | {
      kind: "request_full_access";
      reason: "update" | "cancel";
      link: CalendarLink;
      draft?: CalendarEventDraft;
    }
  | { kind: "update"; link: CalendarLink; draft: CalendarEventDraft }
  | { kind: "cancel"; link: CalendarLink }
  | { kind: "blocked"; reason: CalendarBlockedReason; message: string };
