import type { ExperienceWriter } from "../api/types.js";
import type {
  ActionExecutionContext,
  ActionExecutor,
} from "../approvals/executor-registry.js";
import {
  createExperienceImportApprovalDraft,
  createExperienceImportApprovalPayload,
  type ExperienceImportApprovalPayload,
} from "../import/approval-draft.js";
import { ExperienceImportProposalStore } from "../import/proposal-store.js";

export function createExperienceImportExecutor(
  writer: ExperienceWriter,
  proposalStore: ExperienceImportProposalStore,
): ActionExecutor {
  return {
    execute: async (context) =>
      executeImport(context, writer, proposalStore),
    reject: (context) => {
      proposalStore.clear(readPayload(context.payload).proposalId);
    },
  };
}

async function executeImport(
  context: ActionExecutionContext,
  writer: ExperienceWriter,
  proposalStore: ExperienceImportProposalStore,
) {
  const payload = readPayload(context.payload);
  const proposal = proposalStore.get(payload.proposalId);
  const pending = payload.candidates;
  if (pending.length === 0) {
    throw new Error("没有可保存的候选经历");
  }

  const saved: Array<{ clientId: string; experienceId: string }> = [];
  const failed: Array<{ clientId: string; message: string }> = [];
  for (const item of pending) {
    if (context.signal?.aborted) {
      throw new Error("经历导入已取消");
    }
    try {
      const { clientId, ...input } = item;
      const experience = await writer.createExperience(
        input,
        context.signal,
      );
      proposalStore.markSaved(
        proposal.id,
        clientId,
        experience.id,
      );
      saved.push({
        clientId,
        experienceId: experience.id,
      });
    } catch (error: unknown) {
      failed.push({
        clientId: item.clientId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failed.length === 0) {
    proposalStore.clear(proposal.id);
  }
  const details = {
    proposalId: proposal.id,
    saved,
    failed,
  };
  return {
    summary:
      failed.length === 0
        ? `已写入 ${saved.length} 条经历`
        : `已写入 ${saved.length} 条，${failed.length} 条失败`,
    details,
    ...(failed.length > 0
      ? {
          nextApproval: {
            draft: createExperienceImportApprovalDraft(
              proposalStore.get(proposal.id),
            ),
            payload: createExperienceImportApprovalPayload(
              proposalStore.get(proposal.id),
            ),
          },
        }
      : {}),
  };
}

function readPayload(payload: unknown): ExperienceImportApprovalPayload {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { proposalId?: unknown }).proposalId !== "string" ||
    !Array.isArray(
      (payload as { candidates?: unknown }).candidates,
    )
  ) {
    throw new Error("经历导入审批 Payload 无效");
  }
  return {
    proposalId: (payload as { proposalId: string }).proposalId,
    candidates: structuredClone(
      (payload as ExperienceImportApprovalPayload).candidates,
    ),
  };
}
