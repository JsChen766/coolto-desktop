import type { IpcMain } from "electron";

import type { UserServices } from "../user-services.js";

export const CALENDAR_IPC_CHANNELS = [
  "calendar:status", "calendar:request-access", "calendar:sync-interview",
  "calendar:open-system-settings",
] as const;

export function registerCalendarIpc(
  ipcMain: IpcMain,
  services: () => Promise<UserServices>,
): void {
  ipcMain.handle("calendar:status", async () => (await services()).calendar.status());
  ipcMain.handle("calendar:request-access", async (_event, value: unknown) => {
    if (value !== "write_only" && value !== "full_access") {
      throw new Error("Calendar 权限级别无效");
    }
    return (await services()).calendar.requestAccess(value);
  });
  ipcMain.handle("calendar:sync-interview", async (_event, value: unknown) => {
    const input = syncInput(value);
    return (await services()).calendar.syncInterview(
      input.applicationId, input.interviewId,
    );
  });
  ipcMain.handle("calendar:open-system-settings", async () =>
    (await services()).calendar.openSystemSettings());
}

function syncInput(value: unknown): { applicationId: string; interviewId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Calendar 同步请求无效");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["applicationId", "interviewId"].includes(key))) {
    throw new Error("Calendar 同步请求包含未知字段");
  }
  return {
    applicationId: id(input.applicationId, "applicationId"),
    interviewId: id(input.interviewId, "interviewId"),
  };
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 240) {
    throw new Error(`${label} 无效`);
  }
  return value.trim();
}
