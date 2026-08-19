import { app, type BrowserWindow, type IpcMain } from "electron";
import { join } from "node:path";

import type { BrowserPageOperator, BrowserPageReader } from "../../browser/types.js";
import type { ResumePdfCompiler } from "../../resume/export/types.js";
import { DesktopAuthService } from "./auth-service.js";
import { registerClearLocalDataIpc } from "./clear-local-data.js";
import {
  CONVERSATION_AGENT_IPC_CHANNELS,
  registerConversationAgentIpc,
} from "./conversation-agent-ipc.js";
import { createElectronResumeDraftRepository } from "./resume-drafts/electron-draft-repository.js";
import {
  registerResumeDraftIpc,
  RESUME_DRAFT_IPC_CHANNELS,
} from "./resume-drafts/resume-draft-ipc.js";
import { ResumeLibraryService } from "./resume-library/resume-library-service.js";
import { registerResumeLibraryIpc, LIBRARY_IPC_CHANNELS } from "./resume-library/resume-library-ipc.js";
import { AUTH_IPC_CHANNELS, registerAuthIpc } from "./auth-ipc.js";
import {
  CHECKOUT_IPC_CHANNELS,
  registerCheckoutIpc,
} from "./checkout-ipc.js";
import { SHELL_IPC_CHANNELS, registerShellIpc } from "./shell-ipc.js";
import {
  APPLICATION_IPC_CHANNELS,
  registerApplicationIpc,
} from "./application-library/application-ipc.js";
import { UserServicesResolver } from "./user-services.js";
import {
  JOB_ASSET_IPC_CHANNELS,
  registerJobAssetIpc,
} from "./job-assets/job-asset-ipc.js";
import { JobAssetReadService } from "./job-assets/job-asset-read-service.js";
import {
  EXPERIENCE_IPC_CHANNELS,
  registerExperienceIpc,
} from "./experience-library/experience-ipc.js";
import {
  registerTrackerChildIpc,
  TRACKER_CHILD_IPC_CHANNELS,
} from "./tracker/tracker-ipc.js";
import { PROFILE_IPC_CHANNELS, registerProfileIpc } from "./profile/profile-ipc.js";
import { ElectronUpdateService } from "./update/electron-update-service.js";
import { electronUpdaterDriver } from "./update/electron-updater-driver.js";
import {
  registerUpdateIpc,
  UPDATE_IPC_CHANNELS,
} from "./update/update-ipc.js";
import {
  registerWindowCloseGuardIpc,
  WINDOW_CLOSE_IPC_CHANNELS,
  WindowCloseGuard,
} from "./window-close-guard.js";

export function registerDesktopIpc(
  ipcMain: IpcMain,
  window: BrowserWindow,
  resumeCompiler: ResumePdfCompiler,
  browserPageReader: BrowserPageReader,
  browserPageOperator: BrowserPageOperator,
): void {
  for (const channel of [
    ...AUTH_IPC_CHANNELS,
    ...CHECKOUT_IPC_CHANNELS,
    ...SHELL_IPC_CHANNELS,
    ...CONVERSATION_AGENT_IPC_CHANNELS,
    ...IPC_CHANNELS,
    ...RESUME_DRAFT_IPC_CHANNELS,
    ...LIBRARY_IPC_CHANNELS,
    ...APPLICATION_IPC_CHANNELS,
    ...JOB_ASSET_IPC_CHANNELS,
    ...EXPERIENCE_IPC_CHANNELS,
    ...TRACKER_CHILD_IPC_CHANNELS,
    ...PROFILE_IPC_CHANNELS,
    ...UPDATE_IPC_CHANNELS,
    ...WINDOW_CLOSE_IPC_CHANNELS,
  ]) {
    ipcMain.removeHandler(channel);
  }
  const auth = new DesktopAuthService();
  const closeGuard = new WindowCloseGuard(window);
  const services = new UserServicesResolver(
    auth,
    window,
    resumeCompiler,
    browserPageReader,
    browserPageOperator,
  );
  window.once("closed", () => {
    services.clear();
    void auth.dispose();
  });
  const servicesForCurrentUser = () => services.get();
  registerQuitFlush(services);
  // Snapshot the in-flight transcript while the runtime is still alive: the
  // closed handler clears services (cancelling the agent) right after, and
  // before-quit waits for this snapshot to land before the process exits.
  window.on("close", () => {
    pendingQuitFlush = services.flushPending().catch(() => {});
  });
  registerAuthIpc(ipcMain, auth, () => services.clear());
  registerCheckoutIpc(ipcMain, auth);
  registerResumeDraftIpc(ipcMain, servicesForCurrentUser);

  const updateService = new ElectronUpdateService(electronUpdaterDriver, {
    feedUrl:
      process.env.COOLTO_UPDATE_FEED_URL ??
      (app.isPackaged
        ? "https://home.coolto.com.cn/downloads/"
        : "http://127.0.0.1:8099"),
    currentVersion: () => app.getVersion(),
    forceDev:
      !app.isPackaged && process.env.COOLTO_UPDATE_DEV === "1",
    isPackaged: app.isPackaged,
    exePath: () => app.getPath("exe"),
    stagingRoot: join(app.getPath("userData"), "update-staging"),
    quit: () => app.quit(),
  });
  updateService.init();
  void updateService.checkPendingInstall();
  registerUpdateIpc(ipcMain, window, updateService);
  registerWindowCloseGuardIpc(ipcMain, closeGuard);
  registerConversationAgentIpc(
    ipcMain,
    window,
    servicesForCurrentUser,
    closeGuard,
  );
  registerClearLocalDataIpc(ipcMain, {
    services: servicesForCurrentUser,
    syncStore: () => auth.requireSyncStore(),
    triggerSync: () => void auth.syncNow(),
  });
  registerShellIpc(ipcMain);

  const resumeLibraryForCurrentUser = async () => {
    const user = auth.requireCurrentUser();
    const currentServices = await servicesForCurrentUser();
    return new ResumeLibraryService(
      currentServices.resumes,
      createElectronResumeDraftRepository(user.id),
    );
  };
  registerResumeLibraryIpc(ipcMain, resumeLibraryForCurrentUser);
  registerJobAssetIpc(ipcMain, async () => {
    const current = await servicesForCurrentUser();
    return new JobAssetReadService(
      current.jds,
      await resumeLibraryForCurrentUser(),
      current.applications,
    );
  });
  registerApplicationIpc(
    ipcMain,
    async () => (await servicesForCurrentUser()).applications,
    async () => (await servicesForCurrentUser()).applicationProposals,
  );
  registerExperienceIpc(
    ipcMain,
    async () => (await servicesForCurrentUser()).experiences,
    async () => (await servicesForCurrentUser()).experienceProposals,
    async () => (await servicesForCurrentUser()).experienceHistory,
  );
  registerProfileIpc(
    ipcMain,
    async () => (await servicesForCurrentUser()).profiles,
    async () => (await servicesForCurrentUser()).profileProposals,
  );
  registerTrackerChildIpc(ipcMain, servicesForCurrentUser);
}

/** In-flight transcript snapshot started on window close; before-quit waits
 * for it (bounded) so the write lands before the process exits. */
let pendingQuitFlush: Promise<void> | undefined;

/**
 * Persists the in-flight agent transcript when the app quits mid-generation
 * (window close / app quit), so an interrupted run keeps its history instead
 * of being lost with the pending prompt IPC. Registered once per process;
 * the wait is bounded so quitting is never blocked.
 */
let quitFlushRegistered = false;
function registerQuitFlush(services: UserServicesResolver): void {
  if (quitFlushRegistered) return;
  quitFlushRegistered = true;
  let flushed = false;
  app.on("before-quit", (event) => {
    if (flushed) return;
    flushed = true;
    event.preventDefault();
    void (async () => {
      try {
        await Promise.race([
          pendingQuitFlush ?? services.flushPending().catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
      } catch {
        // Never block quitting on a failed snapshot.
      } finally {
        app.quit();
      }
    })();
  });
}

const IPC_CHANNELS = [
  "data:clear-local",
] as const;
