import type {
  CalendarStatusView,
  CalendarSyncResult,
} from "../../../calendar/calendar-types.js";

export interface CalendarDesktopApi {
  status(): Promise<CalendarStatusView>;
  requestAccess(level: "write_only" | "full_access"): Promise<CalendarStatusView>;
  syncInterview(input: {
    applicationId: string;
    interviewId: string;
  }): Promise<CalendarSyncResult>;
  openSystemSettings(): Promise<void>;
  onOpenInterview(listener: (input: {
    applicationId: string;
    interviewId: string;
  }) => void): () => void;
}

export type { CalendarStatusView, CalendarSyncResult };
