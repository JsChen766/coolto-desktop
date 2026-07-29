import type { IpcMain } from "electron";

import type { JobAssetReadService } from "./job-asset-read-service.js";

export const JOB_ASSET_IPC_CHANNELS = ["job-assets:get"] as const;

export function registerJobAssetIpc(
  ipcMain: IpcMain,
  getService: () => Promise<JobAssetReadService>,
): void {
  ipcMain.handle("job-assets:get", async () => (await getService()).get());
}
