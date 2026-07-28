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
import { DesktopAgentRuntime } from "./agent-runtime.js";
import { DesktopAuthService } from "./auth-service.js";
import { ConversationStore } from "./conversation-store.js";
import { ConversationSelectedFiles } from "./conversation-selected-files.js";
import { ElectronResumePdfSaveDialog } from "./electron-pdf-save-dialog.js";
import { ResumePdfExportService } from "./resume-pdf-export-service.js";
import { createElectronResumeDraftRepository } from "./resume-drafts/electron-draft-repository.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import { ResumeDraftEditingService } from "./resume-drafts/draft-editing-service.js";
import { ResumeManualEditor } from "../../resume/draft/manual-editor.js";
import { ResumeLibraryService } from "./resume-library/resume-library-service.js";
import { registerResumeLibraryIpc, LIBRARY_IPC_CHANNELS } from "./resume-library/resume-library-ipc.js";
import { ResumeSyncStore } from "./resume-library/resume-sync-store.js";
import { ResumeDraftCloudLinker } from "./resume-library/resume-draft-cloud-linker.js";
import { ExperienceSyncStore } from "./experience-library/experience-sync-store.js";
import { JdSyncStore } from "./jd-library/jd-sync-store.js";
import { AUTH_IPC_CHANNELS, registerAuthIpc } from "./auth-ipc.js";

interface UserServices {
  ownerId: string;
  conversations: ConversationStore;
  resumeDrafts: ResumeDraftService;
  resumeDraftEditing: ResumeDraftEditingService;
  agent: DesktopAgentRuntime;
  selectedFiles: ConversationSelectedFiles;
  resumes: ResumeSyncStore;
}

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
  ]) {
    ipcMain.removeHandler(channel);
  }
  const auth = new DesktopAuthService();
  window.once("closed", () => {
    void auth.dispose();
  });
  const resumePdfExports = new ResumePdfExportService(
    resumeCompiler,
    new ElectronResumePdfSaveDialog(window),
  );
  let services: UserServices | undefined;

  const servicesForCurrentUser = async (): Promise<UserServices> => {
    const user = auth.requireCurrentUser();
    if (services?.ownerId === user.id) {
      return services;
    }
    const conversations = new ConversationStore(user.id);
    const resumeDrafts = new ResumeDraftService(
      user.id,
      createElectronResumeDraftRepository(user.id),
    );
    const selectedFiles = new ConversationSelectedFiles();
	const draftRepository = createElectronResumeDraftRepository(user.id);
	const draftLinker = new ResumeDraftCloudLinker(draftRepository);
	const resumes = new ResumeSyncStore(
		auth.requireSyncStore(),
		() => auth.triggerSync(),
		() => auth.waitForInitialSync(),
		(candidateId, resume) => draftLinker.link(candidateId, resume),
	);
	const experiences = new ExperienceSyncStore(
		auth.requireSyncStore(),
		() => auth.triggerSync(),
		() => auth.waitForInitialSync(),
	);
	const jds = new JdSyncStore(
		auth.requireSyncStore(),
		() => auth.triggerSync(),
		() => auth.waitForInitialSync(),
	);
    services = {
      ownerId: user.id,
      conversations,
      resumeDrafts,
      resumeDraftEditing: new ResumeDraftEditingService(
        resumeDrafts,
        new ResumeManualEditor(resumeCompiler),
      ),
      agent: new DesktopAgentRuntime(
        auth.apiClient,
        conversations,
        resumeDrafts,
        window.webContents,
        resumeCompiler,
        resumePdfExports,
        selectedFiles,
        browserPageReader,
        browserPageOperator,
		resumes,
		experiences,
		jds,
      ),
      selectedFiles,
	  resumes,
    };
    return services;
  };

  registerAuthIpc(ipcMain, auth, () => {
    services?.agent.cancel();
    services?.selectedFiles.clear();
    services = undefined;
  });

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

  registerResumeLibraryIpc(ipcMain, async () => {
    const user = auth.requireCurrentUser();
	const currentServices = await servicesForCurrentUser();
    return new ResumeLibraryService(
	  currentServices.resumes,
      createElectronResumeDraftRepository(user.id),
    );
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
