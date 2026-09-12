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
  "applications:prepare-create",
  "applications:prepare-update",
  "applications:prepare-transition",
  "applications:prepare-delete",
  "applications:execute-proposal",
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
    "applications:prepare-transition",
    async (_event, raw: unknown) => {
      const input = parseApplicationTransition(raw);
      return (await getProposals()).prepareTransition(
        input.applicationId,
        input.transition,
      );
    },
  );
  ipcMain.handle(
    "applications:prepare-delete",
    async (_event, raw: unknown) =>
      (await getProposals()).prepareDelete(parseApplicationId(raw)),
  );
  ipcMain.handle(
    "applications:execute-proposal",
    async (_event, raw: unknown) => {
      const result = await (await getProposals()).execute(parseProposalId(raw));
      if (!("companyName" in result)) await onDeleted?.(result.id);
      return result;
    },
  );
}
