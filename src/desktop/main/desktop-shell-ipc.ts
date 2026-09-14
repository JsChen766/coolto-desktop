import type { IpcMain } from "electron";

import type { DesktopWindowShell } from "./desktop-window-shell.js";
import type { UserServices } from "./user-services.js";
import {
  MAX_ACTIVE_EXPERIENCES,
  MAX_ACTIVE_RESUMES,
} from "./asset-capacity.js";

type CurrentUserServices = () => Promise<UserServices>;

export const DESKTOP_SHELL_IPC_CHANNELS = [
  "window:desktop-prefs",
  "window:set-always-on-top",
  "window:asset-usage",
] as const;

export function registerDesktopShellIpc(
  ipcMain: IpcMain,
  shell: DesktopWindowShell,
  servicesForCurrentUser: CurrentUserServices,
): void {
  ipcMain.handle("window:desktop-prefs", () => shell.prefs());
  ipcMain.handle("window:set-always-on-top", async (_event, value: unknown) => {
    if (typeof value !== "boolean") throw new Error("窗口置顶状态无效");
    return shell.setAlwaysOnTop(value);
  });
  ipcMain.handle("window:asset-usage", async () => {
    const services = await servicesForCurrentUser();
    const [experiences, resumes] = await Promise.all([
      services.experiences.searchExperiences({ status: "active", limit: 500 }),
      services.resumes.listResumes(),
    ]);
    return {
      experiences: experiences.items.length,
      experienceMax: MAX_ACTIVE_EXPERIENCES,
      resumes: resumes.filter((resume) => resume.status !== "archived").length,
      resumeMax: MAX_ACTIVE_RESUMES,
    };
  });
}
