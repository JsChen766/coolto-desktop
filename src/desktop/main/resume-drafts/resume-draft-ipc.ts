import type { IpcMain } from "electron";

import { buildDraftPdfExportPayload } from "../../../resume/export/draft-export.js";
import type {
  ResumeDraftEditInput,
  ResumeDraftExportPdfInput,
  ResumeDraftRestoreInput,
} from "../../shared/types.js";
import type { UserServices } from "../user-services.js";

export const RESUME_DRAFT_IPC_CHANNELS = [
  "resume-drafts:list",
  "resume-drafts:get",
  "resume-drafts:edit",
  "resume-drafts:restore",
  "resume-drafts:accept",
  "resume-drafts:reject",
  "resume-drafts:export-pdf",
] as const;

export function registerResumeDraftIpc(
  ipcMain: IpcMain,
  servicesForCurrentUser: () => Promise<UserServices>,
): void {
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
  ipcMain.handle(
    "resume-drafts:export-pdf",
    async (_event, input: ResumeDraftExportPdfInput) => {
      const current = await servicesForCurrentUser();
      const draft = await current.resumeDrafts.get(input.artifactId);
      const payload = buildDraftPdfExportPayload({
        draft,
        expectedRevision: input.expectedRevision,
      });
      return current.resumePdfExports.exportPdf(payload);
    },
  );
}
