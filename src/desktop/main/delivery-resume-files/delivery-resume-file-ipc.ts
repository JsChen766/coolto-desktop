import { dialog, type BrowserWindow, type IpcMain } from "electron";

import type { DeliveryResumeFileRepository } from
  "../../../delivery-resume-files/file-repository.js";
import type {
  DeliveryResumeFileRenameInput,
  DeliveryResumeFileSelectInput,
} from "../../shared/types.js";

type RepositoryProvider = () => Promise<DeliveryResumeFileRepository>;

export function registerDeliveryResumeFileIpc(
  ipcMain: IpcMain,
  window: BrowserWindow,
  getRepository: RepositoryProvider,
): void {
  ipcMain.handle("delivery-resume-files:list", async () =>
    (await getRepository()).list());
  ipcMain.handle("delivery-resume-files:import", async () => {
    const selection = await dialog.showOpenDialog(window, {
      title: "保存用户原始简历用于投递",
      properties: ["openFile"],
      filters: [{ name: "简历文件", extensions: ["pdf", "docx"] }],
    });
    const path = selection.filePaths[0];
    return selection.canceled || !path
      ? undefined
      : (await getRepository()).importFile(path);
  });
  ipcMain.handle(
    "delivery-resume-files:rename",
    async (_event, input: DeliveryResumeFileRenameInput) =>
      (await getRepository()).rename(input.fileId, input.title),
  );
  ipcMain.handle(
    "delivery-resume-files:select",
    async (_event, input: DeliveryResumeFileSelectInput) =>
      (await getRepository()).setPreferred(input.fileId),
  );
  ipcMain.handle(
    "delivery-resume-files:delete",
    async (_event, input: DeliveryResumeFileSelectInput) =>
      (await getRepository()).delete(input.fileId),
  );
}

export const DELIVERY_RESUME_FILE_IPC_CHANNELS = [
  "delivery-resume-files:list",
  "delivery-resume-files:import",
  "delivery-resume-files:rename",
  "delivery-resume-files:select",
  "delivery-resume-files:delete",
] as const;
