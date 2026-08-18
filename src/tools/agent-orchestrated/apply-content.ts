import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { ApprovalManager } from "../../approvals/approval-manager.js";
import {
  createAugmentedApprovalDraft,
  createAugmentedApprovalPayload,
  RESUME_AUGMENTED_CONFIRM_ACTION_TYPE,
} from "../../resume/confirmation/augmented-approval.js";
import { applyAgentResumeContent } from "../../resume/workspace/agent-content-applier.js";
import type { AgentAugmentedFragmentInput } from "../../resume/workspace/agent-content-types.js";
import { hasPendingAugmentedContent } from "../../resume/workspace/augmentation-state.js";
import { buildAgentWorkspaceReceipt } from "../../resume/workspace/agent-workspace-view.js";
import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import { resumeAgentNextAction } from "../../resume/workspace/agent-next-action.js";
import { resumeWriteRejection } from "../../resume/workspace/agent-write-rejection.js";
import { selectLineRewrites } from "../../resume/workspace/line-rewrite-selector.js";
import { narrowTailRepairBatch } from "../../resume/workspace/tail-repair-targets.js";
import type { TailRepairAttemptRecord } from "../../resume/workspace/tail-repair-state.js";
import {
  selectTailRepairPlan,
  type TailRepairSelectionDiagnostics,
  type TailRepairTargetFeedback,
} from "../../resume/workspace/tail-repair-selector.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { resolveResumeContentChanges } from "./content-change-resolver.js";
import { resumeWriteRejectedResult } from "./resume-write-rejected-result.js";
import { applyContentParameters as parameters } from "./apply-content-parameters.js";
import { recordPageFillOutcome } from "../../resume/workspace/page-fill-progress.js";

export function createApplyResumeContentTool(
  compiler: ResumeCompiler,
  store: ResumeWorkspaceStore,
  approvalManager?: ApprovalManager,
): AgentTool<typeof parameters> {
  return {
    name: "apply_resume_content",
    label: "批量写入简历内容",
    description:
      "批量写入并真实测量简历。严格执行 nextAction.requiredInput 且一次只传一种写入模式；轻微溢出只能用 bulletRemovals 每轮删除一个高于最低条数的低价值 bullet；repair_bullet_depth 用一次 lineRewrites 覆盖全部短 bullet并应用全部有效增长，篇幅阶段按单页容量选择跨行结果。",
    executionMode: "sequential",
    parameters,
    execute: async (_toolCallId, params) => {
      const workspace = store.get(params.candidateId);
      if (workspace.revision !== params.expectedRevision) {
        return resumeWriteRejectedResult(
          workspace,
          `expectedRevision=${params.expectedRevision} 与当前 revision=${workspace.revision} 不一致；草稿未修改，请从本回执复制当前 revision，不要自行递增`,
        );
      }
      const action = resumeAgentNextAction(workspace);
      const pageFillAttempt = action.mode === "increase_usage";
      const modeCount = [params.items, params.bulletUpdates,
        params.bulletRemovals,
        params.bulletAdditions, params.tailRepairs, params.lineRewrites]
        .filter((value) => value?.length).length;
      if (modeCount !== 1) {
        return resumeWriteRejectedResult(
          workspace,
          "items、bulletUpdates、bulletRemovals、bulletAdditions、tailRepairs、lineRewrites 必须且只能提供一种",
        );
      }
      const rejectedReason = resumeWriteRejection(workspace, params);
      if (rejectedReason) {
        return resumeWriteRejectedResult(workspace, rejectedReason);
      }
      let resolved: Parameters<typeof resolveResumeContentChanges>[1] = params;
      let rewriteWarning: string | undefined;
      let tailRepairFeedback: TailRepairTargetFeedback[] | undefined;
      let selectedTailDiagnostics: TailRepairSelectionDiagnostics | undefined;
      let augmentations: AgentAugmentedFragmentInput[] = [];
      let tailRepairAttempts: TailRepairAttemptRecord[] | undefined;
      let lineRewriteDiagnostics;
      let pageFillProgressMade: boolean | undefined;
      if (params.tailRepairs) {
        let selected;
        try {
          selected = await selectTailRepairPlan(
            workspace,
            params.tailRepairs,
            compiler,
          );
        } catch (error: unknown) {
          return resumeWriteRejectedResult(
            workspace,
            error instanceof Error ? error.message : String(error),
          );
        }
        tailRepairFeedback = selected.feedback;
        selectedTailDiagnostics = selected.diagnostics;
        if (!selected.updates.length) {
          const retryWorkspace = store.replace(
            narrowTailRepairBatch(
              workspace,
              selected.attemptRecords,
              selected.allowedNetLineDelta,
            ),
            workspace.revision,
          );
          return resumeWriteRejectedResult(
            retryWorkspace,
            selected.writeRejectedReason ?? "tailRepairs 未命中真实排版",
            {
              tailRepairFeedback,
              tailRepairDiagnostics: selected.diagnostics,
            },
          );
        }
        rewriteWarning = selected.writeRejectedReason;
        augmentations = selected.augmentations;
        tailRepairAttempts = selected.attemptRecords;
        resolved = { bulletUpdates: selected.updates };
      }
      if (params.lineRewrites) {
        const selected = await selectLineRewrites(
          workspace,
          params.lineRewrites,
          compiler,
          {
            goal: action.mode === "repair_bullet_depth"
              ? "bullet_depth"
              : "page_fill",
            ...(action.mode === "repair_bullet_depth"
              ? { minimumLines: action.minimumLines }
              : {}),
          },
        );
        lineRewriteDiagnostics = selected.diagnostics;
        if (!selected.updates.length) {
          const retryWorkspace = pageFillAttempt
            ? store.replace(
                recordPageFillOutcome(workspace, false),
                workspace.revision,
              )
            : workspace;
          return resumeWriteRejectedResult(
            retryWorkspace,
            selected.writeRejectedReason ?? "lineRewrites 没有产生有效增长",
            { lineRewriteDiagnostics: selected.diagnostics },
          );
        }
        rewriteWarning = selected.writeRejectedReason;
        if (pageFillAttempt) pageFillProgressMade = true;
        resolved = { bulletUpdates: selected.updates };
      }
      let items;
      try {
        items = resolveResumeContentChanges(workspace, resolved);
      } catch (error: unknown) {
        return resumeWriteRejectedResult(
          workspace,
          error instanceof Error ? error.message : String(error),
        );
      }
      const applied = await applyAgentResumeContent({
        workspace,
        items,
        augmentations,
        ...(tailRepairAttempts ? { tailRepairAttempts } : {}),
        compiler,
        store,
        pageFillAttempt,
        ...(pageFillProgressMade === undefined
          ? {}
          : { pageFillProgressMade }),
      });
      const payload = buildAgentWorkspaceReceipt(
        applied.workspace,
        applied.operation,
      );
      const approvalRequestId = await syncAugmentedApproval(
        applied.workspace,
        approvalManager,
      );
      const result = {
        ...payload,
        ...(params.bulletRemovals
          ? {
              overflowReductionDiagnostics: {
                removedBulletCount: applied.operation.appliedItemIds.length
                  ? params.bulletRemovals.length
                  : 0,
              },
            }
          : {}),
        ...(rewriteWarning ? { rewriteWarning } : {}),
        ...(tailRepairFeedback ? { tailRepairFeedback } : {}),
        ...(params.tailRepairs && selectedTailDiagnostics
          ? { tailRepairDiagnostics: selectedTailDiagnostics }
          : {}),
        ...(params.lineRewrites && lineRewriteDiagnostics
          ? { lineRewriteDiagnostics }
          : {}),
        ...(approvalRequestId ? { approvalRequestId } : {}),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: {
          ...result,
          loopGuardKey: resumeContentProgressKey(applied.workspace),
        },
      };
    },
  };
}

async function syncAugmentedApproval(
  workspace: ReturnType<ResumeWorkspaceStore["get"]>,
  approvalManager: ApprovalManager | undefined,
): Promise<string | undefined> {
  if (!approvalManager) return undefined;
  const pending = hasPendingAugmentedContent(workspace);
  const readyForConfirmation =
    resumeAgentNextAction(workspace).mode === "await_augmented_confirmation";
  if (!pending || !readyForConfirmation) {
    await approvalManager.dismissByActionType(
      RESUME_AUGMENTED_CONFIRM_ACTION_TYPE,
    );
    return undefined;
  }
  const request = await approvalManager.request(
    createAugmentedApprovalDraft(workspace),
    createAugmentedApprovalPayload(workspace),
  );
  return request.id;
}
