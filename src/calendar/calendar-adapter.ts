import type {
  CalendarAuthorizationStatus,
  CalendarEventDraft,
} from "./calendar-types.js";

export interface CalendarEventIdentity {
  eventIdentifier: string;
  calendarIdentifier: string | null;
}

export interface CalendarAdapter {
  authorizationStatus(): Promise<CalendarAuthorizationStatus>;
  requestAccess(level: "write_only" | "full_access"):
    Promise<CalendarAuthorizationStatus>;
  createEvent(draft: CalendarEventDraft): Promise<CalendarEventIdentity>;
  updateEvent(
    eventIdentifier: string,
    draft: CalendarEventDraft,
  ): Promise<CalendarEventIdentity>;
  cancelEvent(eventIdentifier: string): Promise<void>;
  openSystemSettings(): Promise<void>;
}
