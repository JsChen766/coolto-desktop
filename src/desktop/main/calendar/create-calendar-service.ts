import type { ApplicationSyncStore } from "../application-library/application-sync-store.js";
import type { InterviewSyncStore } from "../tracker/interview-sync-store.js";
import type { ReminderSyncStore } from "../tracker/reminder-sync-store.js";
import { CalendarSyncService } from "./calendar-sync-service.js";
import { ElectronCalendarLinkStore } from "./electron-calendar-link-store.js";
import { NativeEventKitAdapter } from "./native-eventkit-adapter.js";

export function createCalendarService(
  ownerId: string,
  applications: ApplicationSyncStore,
  interviews: InterviewSyncStore,
  reminders: ReminderSyncStore,
): CalendarSyncService {
  return new CalendarSyncService(
    new NativeEventKitAdapter(),
    new ElectronCalendarLinkStore(ownerId),
    applications,
    interviews,
    reminders,
  );
}
