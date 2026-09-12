import type { IpcMain } from "electron";

import { buildDraftPdfExportPayload } from "../../../resume/export/draft-export.js";
import { buildDraftSavePayload } from "../../../resume/save/draft-save.js";
import { toResumeDraftDetail } from "./draft-view.js";
import {
  assertRevisionDeliveryCurrent,
  createRevisionDeliveryManifest,
  parseRevisionDeliveryManifest,
  sameRevisionDelivery,
} from "../../../resume/workspace/revision-delivery-contract.js";
import type { RevisionDeliveryManifest } from "../../../resume/export/types.js";
import type { LocalResumeDraft } from "../../../resume/draft/types.js";
import { sha256, stableStringify } from "../../../resume/stable-snapshot.js";
import type { ResumeWorkspace } from "../../../resume/workspace/types.js";
import type {
  ResumeDraftDetail,
  ResumeDraftEditInput,
  ResumeDraftLineSpacingInput,
  ResumeDraftRestoreInput,
  ResumeDraftSaveInput,
} from "../../shared/types.js";
import type { UserServices } from "../user-services.js";

export const RESUME_DRAFT_IPC_CHANNELS = [
  "resume-drafts:list",
  "resume-drafts:get",
  "resume-drafts:edit",
  "resume-drafts:set-line-spacing",
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
  const withDraftLock = <T>(
    artifactId: string,
    action: () => Promise<T>,
  ): Promise<T> => {
    if (saving.has(artifactId)) {
      throw new Error("当前简历正在执行其他操作，请稍候再试");
    }
    saving.add(artifactId);
    return action().finally(() => saving.delete(artifactId));
  };
  const withDraftOperationLock = <T>(
    artifactId: string,
    action: (current: UserServices) => Promise<T>,
  ): Promise<T> =>
    withDraftLock(artifactId, async () => {
      const current = await servicesForCurrentUser();
      return current.resumeDrafts.withArtifactOperationLock(
        artifactId,
        () => action(current),
      );
    });
  ipcMain.handle("resume-drafts:list", async () =>
    (await servicesForCurrentUser()).resumeDrafts.list(),
  );
  ipcMain.handle("resume-drafts:get", async (_event, artifactId: string) => {
    const current = await servicesForCurrentUser();
    return previewDetail(current, artifactId);
  });
  ipcMain.handle(
    "resume-drafts:edit",
    async (_event, input: ResumeDraftEditInput) =>
      withDraftOperationLock(input.artifactId, async (current) => {
        await current.resumeDraftEditing.edit(input);
        return previewDetail(current, input.artifactId);
      }),
  );
  ipcMain.handle(
    "resume-drafts:set-line-spacing",
    async (_event, input: ResumeDraftLineSpacingInput) =>
      withDraftOperationLock(input.artifactId, async (current) => {
        await current.resumeDraftEditing.setLineSpacing(input);
        return previewDetail(current, input.artifactId);
      }),
  );
  ipcMain.handle(
    "resume-drafts:restore",
    async (_event, input: ResumeDraftRestoreInput) =>
      withDraftOperationLock(input.artifactId, async (current) => {
        await current.resumeDraftEditing.restore(input);
        return previewDetail(current, input.artifactId);
      }),
  );
  ipcMain.handle("resume-drafts:accept", async (_event, artifactId: string) =>
    withDraftOperationLock(artifactId, async (current) => {
      await current.resumeDraftEditing.accept(artifactId);
      return previewDetail(current, artifactId);
    }),
  );
  ipcMain.handle("resume-drafts:reject", async (_event, artifactId: string) =>
    withDraftOperationLock(artifactId, async (current) => {
      await current.resumeDraftEditing.reject(artifactId);
      return previewDetail(current, artifactId);
    }),
  );
  ipcMain.handle(
    "resume-drafts:export-pdf",
    async (_event, rawInput: unknown) => {
      const input = parseDraftDeliveryInput(rawInput, "简历导出参数无效");
      return withDraftOperationLock(input.artifactId, async (current) => {
        const draft = await current.resumeDrafts.get(input.artifactId);
        const deliveryManifest = deliveryManifestFor(
          draft.workspace,
          "pdf",
          input.deliveryManifest,
        );
        const payload = buildDraftPdfExportPayload({
          draft,
          expectedRevision: input.expectedRevision,
        });
        return current.resumePdfExports.exportPdf({
          ...payload,
          deliveryManifest,
        });
      });
    },
  );
  ipcMain.handle(
    "resume-drafts:save",
    async (_event, rawInput: ResumeDraftSaveInput) => {
      const input = parseSaveInput(rawInput);
      return withDraftOperationLock(input.artifactId, async (current) => {
        const draft = await current.resumeDrafts.get(input.artifactId);
        const deliveryManifest = deliveryManifestFor(
          draft.workspace,
          "save",
          input.deliveryManifest,
        );
        const payload = buildDraftSavePayload({
          draft,
          expectedRevision: input.expectedRevision,
        });
        const deliveryPayload = { ...payload, deliveryManifest };
        const idempotencyKey = sha256(stableStringify({
          artifactId: input.artifactId,
          revision: input.expectedRevision,
          mode: payload.mode,
          resumeId: payload.resumeId ?? null,
        }));
        if (payload.mode === "new_resume") {
          await current.resumes.publishNew(deliveryPayload, idempotencyKey);
        } else {
          await current.resumes.publishExisting(deliveryPayload, idempotencyKey);
        }
        return previewDetail(current, input.artifactId);
      });
    },
  );
}

async function previewDetail(
  current: UserServices,
  artifactId: string,
): Promise<ResumeDraftDetail> {
  return previewDetailFromDraft(await current.resumeDrafts.get(artifactId));
}


function previewDetailFromDraft(draft: LocalResumeDraft): ResumeDraftDetail {
  const detail = toResumeDraftDetail(draft);
  if (!detail.generationReadiness.ready) return detail;
  return {
    ...detail,
    deliveryManifest: createRevisionDeliveryManifest(
      draft.workspace,
      "preview",
    ),
  };
}
function deliveryManifestFor(
  workspace: ResumeWorkspace,
  consumer: "save" | "pdf",
  expected: RevisionDeliveryManifest | undefined,
): RevisionDeliveryManifest {
  if (!expected || expected.consumer !== "preview") {
    throw new Error("Resume delivery requires a preview delivery manifest");
  }
  const current = createRevisionDeliveryManifest(workspace, consumer);
  assertRevisionDeliveryCurrent(expected, workspace);
  if (!sameRevisionDelivery(expected, current)) {
    throw new Error("Resume delivery is stale: preview version changed");
  }
  return current;
}


const DRAFT_INPUT_KEYS: Record<string, true> = { artifactId: true, expectedRevision: true, deliveryManifest: true };

function parseSaveInput(value: unknown): ResumeDraftSaveInput {
  return parseDraftDeliveryInput(value, "简历保存参数无效");
}

function parseDraftDeliveryInput(
  value: unknown,
  errorMessage: string,
): ResumeDraftSaveInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(errorMessage);
  }
  const record = value as Record<string, unknown>;
  const artifactId = record.artifactId;
  const expectedRevision = record.expectedRevision;
  if (
    Object.keys(record).some((key) => !DRAFT_INPUT_KEYS[key]) ||
    typeof artifactId !== "string" ||
    !artifactId.trim() ||
    typeof expectedRevision !== "number" ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    throw new Error(errorMessage);
  }
  const deliveryManifest = parseRevisionDeliveryManifest(
    record.deliveryManifest,
  );
  return {
    artifactId: artifactId.trim(),
    expectedRevision,
    ...(deliveryManifest ? { deliveryManifest } : {}),
  };
}
