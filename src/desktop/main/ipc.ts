import { dialog, type BrowserWindow, type IpcMain } from "electron";

import type { ApprovalDecision } from "../../approvals/types.js";
import type { BrowserPageOperator, BrowserPageReader } from "../../browser/types.js";
import type { ResumePdfCompiler } from "../../resume/export/types.js";
import type {
  AgentPromptInput,
  AttachmentRemoveInput,
  ApprovalResolveInput,
  ConversationRenameInput,
  ResumeDraftEditInput,
  ResumeDraftRestoreInput,
} from "../shared/types.js";
import { DesktopAuthService } from "./auth-service.js";
import { createElectronResumeDraftRepository } from "./resume-drafts/electron-draft-repository.js";
import { ResumeLibraryService } from "./resume-library/resume-library-service.js";
import { registerResumeLibraryIpc, LIBRARY_IPC_CHANNELS } from "./resume-library/resume-library-ipc.js";
import { AUTH_IPC_CHANNELS, registerAuthIpc } from "./auth-ipc.js";
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

export function registerDesktopIpc(
  ipcMain: IpcMain,
  window: BrowserWindow,
  resumeCompiler: ResumePdfCompiler,
  browserPageReader: BrowserPageReader,
  browserPageOperator: BrowserPageOperator,
): void {
  for (const channel of [
    ...AUTH_IPC_CHANNELS,
    ...IPC_CHANNELS,
    ...LIBRARY_IPC_CHANNELS,
    ...APPLICATION_IPC_CHANNELS,
    ...JOB_ASSET_IPC_CHANNELS,
    ...EXPERIENCE_IPC_CHANNELS,
    ...TRACKER_CHILD_IPC_CHANNELS,
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

  registerAuthIpc(ipcMain, auth, () => services.clear());

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

  ipcMain.handle("resume-drafts:list", async () =>
    (await servicesForCurrentUser()).resumeDrafts.list(),
  );
  ipcMain.handle("resume-drafts:get", async (_event, artifactId: string) =>
    (await servicesForCurrentUser()).resumeDraftEditing.get(artifactId),
  );
  ipcMain.handle(
    "resume-drafts:edit",
    async (_event, input: ResumeDraftEditInput) =>
      (await servicesForCurrentUser()).resumeDraftEditing.edit(input),
  );
  ipcMain.handle(
    "resume-drafts:restore",
    async (_event, input: ResumeDraftRestoreInput) =>
      (await servicesForCurrentUser()).resumeDraftEditing.restore(input),
  );
  ipcMain.handle("resume-drafts:accept", async (_event, artifactId: string) =>
    (await servicesForCurrentUser()).resumeDraftEditing.accept(artifactId),
  );
  ipcMain.handle("resume-drafts:reject", async (_event, artifactId: string) =>
    (await servicesForCurrentUser()).resumeDraftEditing.reject(artifactId),
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

  ipcMain.handle("window:minimize", () => window.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });
  ipcMain.handle("window:close", () => window.close());

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
  registerTrackerChildIpc(ipcMain, servicesForCurrentUser);
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
  "resume-drafts:list",
  "resume-drafts:get",
  "resume-drafts:edit",
  "resume-drafts:restore",
  "resume-drafts:accept",
  "resume-drafts:reject",
  "agent:prompt",
  "agent:cancel",
  "agent:resolve-approval",
  "window:minimize",
  "window:toggle-maximize",
  "window:close",
] as const;
