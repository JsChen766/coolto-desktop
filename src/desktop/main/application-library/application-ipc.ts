import type { IpcMain } from "electron";

import type { ApplicationSyncStore } from "./application-sync-store.js";
import type { ApplicationProposalService } from "./application-proposal-service.js";
import {
  parseApplicationId,
  parseProposalId,
  parseApplicationCreate,
  parseApplicationUpdate,
  parseApplicationTransition,
  parseApplicationList,
} from "./application-ipc-validation.js";

export const APPLICATION_IPC_CHANNELS = [
  "applications:list",
  "applications:references",
  "applications:get",
  "applications:create",
  "applications:prepare-create",
  "applications:prepare-update",
  "applications:execute-proposal",
  "applications:update",
  "applications:transition",
  "applications:delete",
] as const;

export function registerApplicationIpc(
  ipcMain: IpcMain,
  getStore: () => Promise<ApplicationSyncStore>,
  getProposals: () => Promise<ApplicationProposalService>,
  onDeleted?: (applicationId: string) => Promise<void>,
): void {
  ipcMain.handle(
    "applications:list",
    async (_event, raw?: unknown) =>
      (await getStore()).listApplications(parseApplicationList(raw)),
  );
  ipcMain.handle("applications:references", async () =>
    (await getStore()).listReferenceOptions(),
  );
  ipcMain.handle("applications:get", async (_event, raw: unknown) =>
    (await getStore()).getApplication(parseApplicationId(raw)),
  );
  ipcMain.handle(
    "applications:create",
    async (_event, raw: unknown) =>
      (await getStore()).createApplication(parseApplicationCreate(raw)),
  );
  ipcMain.handle(
    "applications:prepare-create",
    async (_event, raw: unknown) =>
      (await getProposals()).prepareCreate(parseApplicationCreate(raw)),
  );
  ipcMain.handle(
    "applications:prepare-update",
    async (_event, raw: unknown) => {
      const input = parseApplicationUpdate(raw);
      return (await getProposals()).prepareUpdate(input.applicationId, input.changes);
    },
  );
  ipcMain.handle(
    "applications:execute-proposal",
    async (_event, raw: unknown) =>
      (await getProposals()).execute(parseProposalId(raw)),
  );
  ipcMain.handle(
    "applications:update",
    async (_event, raw: unknown) => {
      const input = parseApplicationUpdate(raw);
      return (await getStore()).updateApplication(input.applicationId, input.changes);
    },
  );
  ipcMain.handle(
    "applications:transition",
    async (_event, raw: unknown) => {
      const input = parseApplicationTransition(raw);
      return (await getStore()).transitionApplication(
        input.applicationId,
        input.transition,
      );
    },
  );
  ipcMain.handle("applications:delete", async (_event, raw: unknown) => {
    const applicationId = parseApplicationId(raw);
    const result = await (await getStore()).deleteApplication(applicationId);
    await onDeleted?.(applicationId);
    return result;
  });
}
