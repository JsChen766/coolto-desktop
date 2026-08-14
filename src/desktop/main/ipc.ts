import { app, dialog, type BrowserWindow, type IpcMain } from "electron";
import { join } from "node:path";

import type { ApprovalDecision } from "../../approvals/types.js";
import type { BrowserPageOperator, BrowserPageReader } from "../../browser/types.js";
import type { ResumePdfCompiler } from "../../resume/export/types.js";
import type {
  AgentPromptInput,
  AttachmentRemoveInput,
  ApprovalResolveInput,
  ConversationRenameInput,
} from "../shared/types.js";
import { DesktopAuthService } from "./auth-service.js";
import { registerClearLocalDataIpc } from "./clear-local-data.js";
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
    ...IPC_CHANNELS,
    ...RESUME_DRAFT_IPC_CHANNELS,
    ...LIBRARY_IPC_CHANNELS,
    ...APPLICATION_IPC_CHANNELS,
    ...JOB_ASSET_IPC_CHANNELS,
    ...EXPERIENCE_IPC_CHANNELS,
    ...TRACKER_CHILD_IPC_CHANNELS,
    ...PROFILE_IPC_CHANNELS,
    ...UPDATE_IPC_CHANNELS,
  ]) {
    ipcMain.removeHandler(channel);
  }
  const auth = new DesktopAuthService();
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
      process.env.COOLTO_UPDATE_FEED_URL ?? "http://127.0.0.1:8099",
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

  ipcMain.handle("conversations:list", async () =>
    (await servicesForCurrentUser()).conversations.list(),
  );
  ipcMain.handle("conversations:create", async () =>
    (await servicesForCurrentUser()).conversations.create(),
  );
  ipcMain.handle("conversations:get", async (_event, conversationId: string) =>
    (await servicesForCurrentUser()).conversations.get(conversationId),
  );
  ipcMain.handle(
    "conversations:rename",
    async (_event, input: ConversationRenameInput) =>
      (await servicesForCurrentUser()).conversations.rename(
        input.conversationId,
        input.title,
      ),
  );
  ipcMain.handle(
    "conversations:delete",
    async (_event, conversationId: string) => {
      const current = await servicesForCurrentUser();
      await current.conversations.delete(conversationId);
      current.selectedFiles.release(conversationId);
    },
  );

  ipcMain.handle("attachments:list", async (_event, conversationId: string) => {
    const current = await servicesForCurrentUser();
    await current.conversations.get(conversationId);
    return current.selectedFiles.list(conversationId);
  });
  ipcMain.handle(
    "attachments:select",
    async (_event, conversationId: string) => {
      const current = await servicesForCurrentUser();
      await current.conversations.get(conversationId);
      if (current.agent.isRunning) {
        throw new Error("Agent 回复期间不能更换附件");
      }
      const selection = await dialog.showOpenDialog(window, {
        title: "选择简历附件",
        properties: ["openFile"],
        filters: [
          {
            name: "简历文件",
            extensions: ["pdf", "docx", "txt", "md", "markdown"],
          },
        ],
      });
      const path = selection.filePaths[0];
      if (selection.canceled || !path) return undefined;
      return current.selectedFiles.replace(conversationId, path);
    },
  );
  ipcMain.handle(
    "attachments:remove",
    async (_event, input: AttachmentRemoveInput) => {
      const current = await servicesForCurrentUser();
      await current.conversations.get(input.conversationId);
      if (current.agent.isRunning) {
        throw new Error("Agent 回复期间不能移除附件");
      }
      current.selectedFiles.remove(input.conversationId, input.fileId);
    },
  );

  ipcMain.handle("agent:prompt", async (_event, input: AgentPromptInput) =>
    (await servicesForCurrentUser()).agent.prompt(input),
  );
  ipcMain.handle("agent:cancel", async () => {
    (await servicesForCurrentUser()).agent.cancel();
  });
  ipcMain.handle(
    "agent:resolve-approval",
    async (_event, input: ApprovalResolveInput) =>
      (await servicesForCurrentUser()).agent.resolveApproval(
        input.conversationId,
        input.requestId,
        input.decision as ApprovalDecision,
      ),
  );

  registerClearLocalDataIpc(ipcMain, {
    services: servicesForCurrentUser,
    syncStore: () => auth.requireSyncStore(),
    triggerSync: () => void auth.syncNow(),
  });
  ipcMain.handle("window:minimize", () => window.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });
  ipcMain.handle("window:close", () => window.close());
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
  "conversations:list",
  "conversations:create",
  "conversations:get",
  "conversations:rename",
  "conversations:delete",
  "attachments:list",
  "attachments:select",
  "attachments:remove",
  "agent:prompt",
  "agent:cancel",
  "agent:resolve-approval",
  "data:clear-local",
  "window:minimize",
  "window:toggle-maximize",
  "window:close",
] as const;
