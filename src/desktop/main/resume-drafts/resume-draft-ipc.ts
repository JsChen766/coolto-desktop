import type { IpcMain } from "electron";

import { buildDraftPdfExportPayload } from "../../../resume/export/draft-export.js";
import { buildDraftSavePayload } from "../../../resume/save/draft-save.js";
import { sha256, stableStringify } from "../../../resume/stable-snapshot.js";
import type {
  ResumeDraftEditInput,
  ResumeDraftExportPdfInput,
  ResumeDraftRestoreInput,
  ResumeDraftSaveInput,
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
  "resume-drafts:save",
] as const;

export function registerResumeDraftIpc(
  ipcMain: IpcMain,
  servicesForCurrentUser: () => Promise<UserServices>,
): void {
  const saving = new Set<string>();
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
  ipcMain.handle(
    "resume-drafts:save",
    async (_event, rawInput: ResumeDraftSaveInput) => {
      const input = parseSaveInput(rawInput);
      if (saving.has(input.artifactId)) throw new Error("当前简历正在保存");
      saving.add(input.artifactId);
      try {
        const current = await servicesForCurrentUser();
        const draft = await current.resumeDrafts.get(input.artifactId);
        const payload = buildDraftSavePayload({
          draft,
          expectedRevision: input.expectedRevision,
        });
        const idempotencyKey = sha256(stableStringify({
          artifactId: input.artifactId,
          revision: input.expectedRevision,
          mode: payload.mode,
          resumeId: payload.resumeId ?? null,
        }));
        if (payload.mode === "new_resume") {
          await current.resumes.publishNew(payload, idempotencyKey);
        } else {
          await current.resumes.publishExisting(payload, idempotencyKey);
        }
        return current.resumeDraftEditing.get(input.artifactId);
      } finally {
        saving.delete(input.artifactId);
      }
    },
  );
}

function parseSaveInput(value: unknown): ResumeDraftSaveInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("简历保存参数无效");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !["artifactId", "expectedRevision"].includes(key)) ||
    typeof record.artifactId !== "string" || !record.artifactId.trim() ||
    !Number.isInteger(record.expectedRevision) || Number(record.expectedRevision) < 0
  ) throw new Error("简历保存参数无效");
  return {
    artifactId: record.artifactId.trim(),
    expectedRevision: Number(record.expectedRevision),
  };
}
