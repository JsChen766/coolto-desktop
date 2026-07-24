import type { IpcMain } from "electron";
import type {
  LibraryRenameInput,
  LibraryArchiveInput,
  LibraryDeleteDraftInput,
  LibraryRestoreCheckpointInput,
} from "../../shared/types.js";
import type { ResumeLibraryService } from "./resume-library-service.js";

type ServiceProvider = () => Promise<ResumeLibraryService>;

export function registerResumeLibraryIpc(
  ipcMain: IpcMain,
  getService: ServiceProvider,
): void {
  ipcMain.handle("library:list", async () => {
    const svc = await getService();
    return svc.list();
  });

  ipcMain.handle("library:rename", async (_event, input: LibraryRenameInput) => {
    const svc = await getService();
    return svc.rename(input.resumeId, input.title);
  });

  ipcMain.handle("library:archive", async (_event, input: LibraryArchiveInput) => {
    const svc = await getService();
    return input.archive
      ? svc.archive(input.resumeId)
      : svc.unarchive(input.resumeId);
  });

  ipcMain.handle("library:delete-draft", async (_event, input: LibraryDeleteDraftInput) => {
    const svc = await getService();
    return svc.deleteLocalDraft(input.artifactId);
  });

  ipcMain.handle("library:get-checkpoints", async (_event, artifactId: string) => {
    const svc = await getService();
    return svc.getCheckpoints(artifactId);
  });

  ipcMain.handle(
    "library:restore-checkpoint",
    async (_event, input: LibraryRestoreCheckpointInput) => {
      const svc = await getService();
      return svc.restoreCheckpoint(input.artifactId, input.checkpointId);
    },
  );
}

export const LIBRARY_IPC_CHANNELS = [
  "library:list",
  "library:rename",
  "library:archive",
  "library:delete-draft",
  "library:get-checkpoints",
  "library:restore-checkpoint",
] as const;
