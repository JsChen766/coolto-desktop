import { dialog, type BrowserWindow, type IpcMain } from "electron";

import type { ApprovalDecision } from "../../approvals/types.js";
import type {
  AgentPromptInput,
  AttachmentRemoveInput,
  ApprovalResolveInput,
  ConversationRenameInput,
} from "../shared/types.js";
import type { UserServices } from "./user-services.js";
import type { WindowCloseGuard } from "./window-close-guard.js";

type CurrentUserServices = () => Promise<UserServices>;

export function registerConversationAgentIpc(
  ipcMain: IpcMain,
  window: BrowserWindow,
  servicesForCurrentUser: CurrentUserServices,
  closeGuard: WindowCloseGuard,
): void {
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
  ipcMain.handle("conversations:delete", async (_event, conversationId: string) => {
    const current = await servicesForCurrentUser();
    await current.conversations.delete(conversationId);
    current.selectedFiles.release(conversationId);
  });

  ipcMain.handle("attachments:list", async (_event, conversationId: string) => {
    const current = await servicesForCurrentUser();
    await current.conversations.get(conversationId);
    return current.selectedFiles.list(conversationId);
  });
  ipcMain.handle("attachments:select", async (_event, conversationId: string) => {
    const current = await servicesForCurrentUser();
    await current.conversations.get(conversationId);
    if (current.agent.isRunning) {
      throw new Error("Agent 回复期间不能更换附件");
    }
    const selection = await dialog.showOpenDialog(window, {
      title: "选择简历附件",
      properties: ["openFile"],
      filters: [{
        name: "简历文件",
        extensions: ["pdf", "docx", "txt", "md", "markdown"],
      }],
    });
    const path = selection.filePaths[0];
    if (selection.canceled || !path) return undefined;
    return current.selectedFiles.replace(conversationId, path);
  });
  ipcMain.handle(
    "attachments:select-path",
    async (_event, conversationId: string, path: string) => {
      const current = await servicesForCurrentUser();
      await current.conversations.get(conversationId);
      if (current.agent.isRunning) {
        throw new Error("Agent 回复期间不能更换附件");
      }
      if (typeof path !== "string" || !path.trim()) return undefined;
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

  ipcMain.handle("window:minimize", () => window.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle("window:close", () => closeGuard.requestClose());
}

export const CONVERSATION_AGENT_IPC_CHANNELS = [
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
  "window:minimize",
  "window:toggle-maximize",
  "window:close",
] as const;
