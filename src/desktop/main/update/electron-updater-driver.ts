import electronUpdater from "electron-updater";
import type { UpdateInfo as UpdaterUpdateInfo } from "electron-updater";

const { autoUpdater } = electronUpdater;

import type {
  UpdateDriver,
  UpdateDriverEventMap,
  UpdateInfo,
} from "./electron-update-service.js";

/**
 * Adapts the electron-updater singleton to the narrow UpdateDriver contract
 * (check-only; download/verify/install are self-owned) so the update state
 * machine stays testable outside Electron.
 */
export const electronUpdaterDriver: UpdateDriver = {
  get autoDownload() {
    return autoUpdater.autoDownload;
  },
  set autoDownload(value: boolean) {
    autoUpdater.autoDownload = value;
  },
  get forceDevUpdateConfig() {
    return autoUpdater.forceDevUpdateConfig;
  },
  set forceDevUpdateConfig(value: boolean) {
    autoUpdater.forceDevUpdateConfig = value;
  },
  setFeedURL(url) {
    autoUpdater.setFeedURL(url);
  },
  checkForUpdates() {
    return autoUpdater.checkForUpdates();
  },
  quitAndInstall() {
    autoUpdater.quitAndInstall();
  },
  on(event, listener) {
    switch (event) {
      case "checking-for-update":
        autoUpdater.on("checking-for-update", () =>
          (listener as UpdateDriverEventMap["checking-for-update"])(),
        );
        break;
      case "update-available":
        autoUpdater.on("update-available", (info: UpdaterUpdateInfo) =>
          (listener as UpdateDriverEventMap["update-available"])(
            toDriverInfo(info),
          ),
        );
        break;
      case "update-not-available":
        autoUpdater.on("update-not-available", (info: UpdaterUpdateInfo) =>
          (listener as UpdateDriverEventMap["update-not-available"])(
            toDriverInfo(info),
          ),
        );
        break;
      case "download-progress":
        autoUpdater.on(
          "download-progress",
          (progress: { percent: number }) =>
            (listener as UpdateDriverEventMap["download-progress"])({
              percent: progress.percent,
            }),
        );
        break;
      case "update-downloaded":
        autoUpdater.on(
          "update-downloaded",
          (info: UpdaterUpdateInfo) =>
            (listener as UpdateDriverEventMap["update-downloaded"])(
              toDriverInfo(info),
            ),
        );
        break;
      case "error":
        autoUpdater.on("error", (error: Error) =>
          (listener as UpdateDriverEventMap["error"])(error),
        );
        break;
    }
    return undefined;
  },
};

function toDriverInfo(info: UpdaterUpdateInfo): UpdateInfo {
  return {
    version: info?.version,
    files: info?.files?.map((file) => ({
      url: file.url,
      sha512: file.sha512,
      size: file.size,
    })),
  };
}
