import { shell } from "electron";

import type {
  CalendarAdapter,
  CalendarEventIdentity,
} from "../../../calendar/calendar-adapter.js";
import type {
  CalendarAuthorizationStatus,
  CalendarEventDraft,
} from "../../../calendar/calendar-types.js";
import { nativeCore } from "../native-protection.js";

const AUTHORIZATIONS = new Set<CalendarAuthorizationStatus>([
  "not_determined", "write_only", "full_access", "denied", "restricted", "unavailable",
]);
type CalendarBinding = Required<Pick<
  NonNullable<ReturnType<typeof nativeCore>>,
  "calendarAuthorizationStatus" | "calendarRequestAccess" |
  "calendarCreateEvent" | "calendarUpdateEvent" | "calendarCancelEvent"
>>;

export class NativeEventKitAdapter implements CalendarAdapter {
  public async authorizationStatus(): Promise<CalendarAuthorizationStatus> {
    if (process.platform !== "darwin") return "unavailable";
    const binding = requireCalendarBinding();
    return authorization(binding.calendarAuthorizationStatus!());
  }

  public async requestAccess(
    level: "write_only" | "full_access",
  ): Promise<CalendarAuthorizationStatus> {
    const binding = requireCalendarBinding();
    const result = response(await binding.calendarRequestAccess!(level));
    const numeric = typeof result.status === "number" ? result.status : -1;
    return authorization(["not_determined", "restricted", "denied", "write_only",
      "full_access"][numeric] ?? "unavailable");
  }

  public async createEvent(draft: CalendarEventDraft): Promise<CalendarEventIdentity> {
    const binding = requireCalendarBinding();
    return identity(response(await binding.calendarCreateEvent!(JSON.stringify(draft))));
  }

  public async updateEvent(
    eventIdentifier: string,
    draft: CalendarEventDraft,
  ): Promise<CalendarEventIdentity> {
    const binding = requireCalendarBinding();
    return identity(response(await binding.calendarUpdateEvent!(JSON.stringify({
      ...draft, eventIdentifier,
    }))));
  }

  public async cancelEvent(eventIdentifier: string): Promise<void> {
    const binding = requireCalendarBinding();
    response(await binding.calendarCancelEvent!(eventIdentifier));
  }

  public async openSystemSettings(): Promise<void> {
    if (process.platform !== "darwin") throw new Error("当前设备不是 macOS");
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars",
    );
  }
}

function requireCalendarBinding(): CalendarBinding {
  if (process.platform !== "darwin") throw new Error("当前设备不支持 macOS Calendar");
  const binding = nativeCore();
  if (!binding?.calendarAuthorizationStatus || !binding.calendarRequestAccess ||
      !binding.calendarCreateEvent || !binding.calendarUpdateEvent ||
      !binding.calendarCancelEvent) {
    throw new Error("当前 macOS 构建缺少 EventKit 原生适配器");
  }
  return binding as CalendarBinding;
}

function response(serialized: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(serialized); } catch { throw new Error("EventKit 返回无效结果"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("EventKit 返回无效结果");
  }
  const result = value as Record<string, unknown>;
  if (result.ok !== true) {
    throw new Error(typeof result.error === "string" ? result.error : "EventKit 操作失败");
  }
  return result;
}

function identity(value: Record<string, unknown>): CalendarEventIdentity {
  if (typeof value.eventIdentifier !== "string" || !value.eventIdentifier.trim()) {
    throw new Error("EventKit 未返回 eventIdentifier");
  }
  if (value.calendarIdentifier !== null && typeof value.calendarIdentifier !== "string") {
    throw new Error("EventKit 返回的 calendarIdentifier 无效");
  }
  return {
    eventIdentifier: value.eventIdentifier,
    calendarIdentifier: value.calendarIdentifier as string | null,
  };
}

function authorization(value: string): CalendarAuthorizationStatus {
  return AUTHORIZATIONS.has(value as CalendarAuthorizationStatus)
    ? value as CalendarAuthorizationStatus : "unavailable";
}
