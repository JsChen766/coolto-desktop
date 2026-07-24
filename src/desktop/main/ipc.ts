import type { BrowserWindow, IpcMain } from "electron";

import type { ApprovalDecision } from "../../approvals/types.js";
import type { ResumePdfCompiler } from "../../resume/export/types.js";
import type {
  AgentPromptInput,
  ApprovalResolveInput,
  ConversationRenameInput,
  ResumeDraftEditInput,
  ResumeDraftRestoreInput,
} from "../shared/types.js";
import { DesktopAgentRuntime } from "./agent-runtime.js";
import { DesktopAuthService } from "./auth-service.js";
import { ConversationStore } from "./conversation-store.js";
import { ElectronResumePdfSaveDialog } from "./electron-pdf-save-dialog.js";
import { ResumePdfExportService } from "./resume-pdf-export-service.js";
import { createElectronResumeDraftRepository } from "./resume-drafts/electron-draft-repository.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import { ResumeDraftEditingService } from "./resume-drafts/draft-editing-service.js";
import { ResumeManualEditor } from "../../resume/draft/manual-editor.js";

interface UserServices {
  ownerId: string;
  conversations: ConversationStore;
  resumeDrafts: ResumeDraftService;
  resumeDraftEditing: ResumeDraftEditingService;
  agent: DesktopAgentRuntime;
}

export function registerDesktopIpc(
  ipcMain: IpcMain,
  window: BrowserWindow,
  resumeCompiler: ResumePdfCompiler,
): void {
  for (const channel of IPC_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
  const auth = new DesktopAuthService();
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
      ),
    };
    return services;
  };

  ipcMain.handle("auth:current", async () => {
    const user = await auth.restore();
    return user ? { id: user.id, email: user.email } : undefined;
  });
  ipcMain.handle(
    "auth:login",
    async (_event, email: string, password: string) => {
      const user = await auth.login(email.trim(), password);
      services = undefined;
      return { id: user.id, email: user.email };
    },
  );
  ipcMain.handle("auth:logout", async () => {
    services?.agent.cancel();
    services = undefined;
    await auth.logout();
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
      await (await servicesForCurrentUser()).conversations.delete(conversationId);
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
}

const IPC_CHANNELS = [
  "auth:current",
  "auth:login",
  "auth:logout",
  "conversations:list",
  "conversations:create",
  "conversations:get",
  "conversations:rename",
  "conversations:delete",
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
