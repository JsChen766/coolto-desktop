import type { IpcMain } from "electron";

import type {
  ApplicationCreateInput,
  ApplicationListOptions,
  ApplicationTransitionRequest,
  ApplicationUpdateRequest,
} from "../../shared/types.js";
import type { ApplicationSyncStore } from "./application-sync-store.js";

export const APPLICATION_IPC_CHANNELS = [
  "applications:list",
  "applications:references",
  "applications:get",
  "applications:create",
  "applications:update",
  "applications:transition",
  "applications:delete",
] as const;

export function registerApplicationIpc(
  ipcMain: IpcMain,
  getStore: () => Promise<ApplicationSyncStore>,
): void {
  ipcMain.handle(
    "applications:list",
    async (_event, options?: ApplicationListOptions) =>
      (await getStore()).listApplications(options),
  );
  ipcMain.handle("applications:references", async () =>
    (await getStore()).listReferenceOptions(),
  );
  ipcMain.handle("applications:get", async (_event, applicationId: string) =>
    (await getStore()).getApplication(applicationId),
  );
  ipcMain.handle(
    "applications:create",
    async (_event, input: ApplicationCreateInput) =>
      (await getStore()).createApplication(input),
  );
  ipcMain.handle(
    "applications:update",
    async (_event, input: ApplicationUpdateRequest) =>
      (await getStore()).updateApplication(input.applicationId, input.changes),
  );
  ipcMain.handle(
    "applications:transition",
    async (_event, input: ApplicationTransitionRequest) =>
      (await getStore()).transitionApplication(
        input.applicationId,
        input.transition,
      ),
  );
  ipcMain.handle("applications:delete", async (_event, applicationId: string) =>
    (await getStore()).deleteApplication(applicationId),
  );
}
