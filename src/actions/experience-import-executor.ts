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
import type { ProfileContactUpdate, ProfileProposalExecutor } from "../profile/types.js";

export function createExperienceImportExecutor(
  writer: ExperienceWriter,
  proposalStore: ExperienceImportProposalStore,
  profiles?: ProfileProposalExecutor,
): ActionExecutor {
  return {
    execute: async (context) => executeImport(context, writer, proposalStore, profiles),
    reject: (context) => proposalStore.clear(readPayload(context.payload).proposalId),
  };
}

async function executeImport(
  context: ActionExecutionContext,
  writer: ExperienceWriter,
  proposalStore: ExperienceImportProposalStore,
  profiles: ProfileProposalExecutor | undefined,
) {
  const payload = readPayload(context.payload);
  const proposal = proposalStore.get(payload.proposalId);
  const selection = readSelection(
    context.decision?.type === "accept" ? context.decision.selection : undefined,
    proposal,
  );
  const saved: Array<{ clientId: string; experienceId: string; title: string }> = [];
  const failed: Array<{ clientId: string; title: string; message: string }> = [];
  if (selection.profile && Object.keys(selection.profile).length) {
    if (!profiles) throw new Error("个人资料同步服务不可用");
    const profileProposal = await profiles.prepareImport(selection.profile, proposal.profileFields);
    await profiles.execute(profileProposal.id);
  }
  for (const item of proposal.candidates.filter((candidate) =>
    selection.candidateIds.has(candidate.candidate.clientId) && !candidate.savedExperienceId,
  )) {
    if (context.signal?.aborted) throw new Error("经历导入已取消");
    try {
      const { clientId, ...input } = item.candidate;
      const experience = await writer.createExperience(
        { ...input, idempotencyKey: `${proposal.id}:${clientId}` }, context.signal,
      );
      proposalStore.markSaved(proposal.id, clientId, experience.id);
      saved.push({ clientId, experienceId: experience.id, title: item.candidate.title });
    } catch (error: unknown) {
      failed.push({ clientId: item.candidate.clientId, title: item.candidate.title,
        message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (!failed.length) proposalStore.clear(proposal.id);
  const details = {
    proposalId: proposal.id, sourceLabel: proposal.sourceLabel ?? null, saved, failed,
    skippedDuplicateCount: proposal.candidates.filter((item) => !item.selected && item.duplicateOf).length,
    completedAt: new Date().toISOString(),
  };
  return {
    summary: `个人资料已${selection.profile ? "加入本地同步队列；" : "未变更；"}已保存 ${saved.length} 条经历到本地，等待同步`,
    details,
    ...(failed.length ? { nextApproval: {
      draft: createExperienceImportApprovalDraft(proposalStore.get(proposal.id)),
      payload: createExperienceImportApprovalPayload(proposalStore.get(proposal.id)),
    } } : {}),
  };
}

function readPayload(payload: unknown): ExperienceImportApprovalPayload {
  if (!payload || typeof payload !== "object" ||
    typeof (payload as { proposalId?: unknown }).proposalId !== "string") {
    throw new Error("经历导入审批 Payload 无效");
  }
  return { proposalId: (payload as { proposalId: string }).proposalId };
}

function readSelection(value: unknown, proposal: ReturnType<ExperienceImportProposalStore["get"]>) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const allowedCandidates = new Set(proposal.candidates.filter((item) => item.selected && !item.savedExperienceId)
    .map((item) => item.candidate.clientId));
  const candidateIds = new Set(readStrings(input.candidateIds, [...allowedCandidates]));
  for (const id of candidateIds) if (!allowedCandidates.has(id)) throw new Error("只能确认当前导入提案中的经历");
  const fields = new Map(proposal.profileFields.map((field) => [field.field, field]));
  const selected = input.profileFields === undefined ? proposal.profileFields.filter((field) => field.selectedByDefault)
    .map((field) => ({ field: field.field, value: field.proposedValue })) : readProfileFields(input.profileFields);
  const profile: ProfileContactUpdate = {};
  for (const { field, value: next } of selected) {
    if (!fields.has(field)) throw new Error("只能确认当前导入提案中的个人资料字段");
    profile[field] = next;
  }
  return { candidateIds, profile: Object.keys(profile).length ? profile : undefined };
}

function readStrings(value: unknown, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error("经历选择无效");
  return value;
}

function readProfileFields(value: unknown): Array<{ field: keyof ProfileContactUpdate; value: string }> {
  if (!Array.isArray(value)) throw new Error("个人资料选择无效");
  return value.map((item) => {
    if (!item || typeof item !== "object" || typeof (item as { field?: unknown }).field !== "string" ||
      typeof (item as { value?: unknown }).value !== "string") throw new Error("个人资料选择无效");
    const field = (item as { field: keyof ProfileContactUpdate }).field;
    const value = (item as { value: string }).value.trim();
    if (!value) throw new Error("导入资料字段不能为空；请取消勾选而不是清空");
    return { field, value };
  });
}
