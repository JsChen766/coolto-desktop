import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ApprovalManager } from "../../approvals/approval-manager.js";
import { applyAgentResumeContent } from "../../resume/workspace/agent-content-applier.js";
import { buildAgentWorkspaceReceipt } from "../../resume/workspace/agent-workspace-view.js";
import { resumeAgentNextAction } from "../../resume/workspace/agent-next-action.js";
import { resumeWriteRejection } from "../../resume/workspace/agent-write-rejection.js";
import { selectLineRewrites } from "../../resume/workspace/line-rewrite-selector.js";
import { formalLineRewriteOutcome } from "../../resume/workspace/line-rewrite-formal-outcome.js";
import type { TailRepairFeedback } from
  "../../resume/workspace/tail-repair-processor.js";
import type { TailRepairProgressState } from "../../resume/workspace/tail-repair-state.js";
import {
  processTailWrite,
  type TailWriteDiagnostics,
} from "../../resume/workspace/tail-write-processor.js";
import { workspaceWithTailRepairProgress } from "../../resume/workspace/tail-repair-workspace.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { resolveResumeContentChanges } from "./content-change-resolver.js";
import { resumeWriteRejectedResult } from "./resume-write-rejected-result.js";
import { applyContentParameters as parameters } from "./apply-content-parameters.js";
import { recordPageFillOutcome } from "../../resume/workspace/page-fill-progress.js";
import { resumeWriteResultForModel } from "./resume-write-result-for-model.js";
import { resumeWriteLoopGuardKey } from "../../resume/workspace/resume-write-loop-key.js";
import { syncAugmentedApproval } from "./sync-augmented-approval.js";

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
        params.bulletAdditions, params.tailGrowths, params.lineRewrites]
        .filter((value) => value?.length).length;
      if (modeCount !== 1) {
        return resumeWriteRejectedResult(
          workspace,
          "items、bulletUpdates、bulletRemovals、bulletAdditions、tailGrowths、lineRewrites 必须且只能提供一种",
        );
      }
      const rejectedReason = resumeWriteRejection(workspace, params);
      if (rejectedReason) {
        return resumeWriteRejectedResult(workspace, rejectedReason);
      }
      let resolved: Parameters<typeof resolveResumeContentChanges>[1] = params;
      let rewriteWarning: string | undefined;
      let tailRepairFeedback: TailRepairFeedback[] | undefined;
      let tailRepairDiagnostics: TailWriteDiagnostics | undefined;
      let tailRepairProgress: TailRepairProgressState | undefined;
      let lineRewriteDiagnostics;
      let pageFillProgressMade: boolean | undefined;
      let tailWriteHandled = false;
      if (params.tailGrowths || action.mode === "batch_tail_reflow") {
        let processed;
        try {
          processed = await processTailWrite(
            workspace,
            action,
            params,
            compiler,
          );
        } catch (error: unknown) {
          return resumeWriteRejectedResult(
            workspace,
            error instanceof Error ? error.message : String(error),
          );
        }
        if (!processed) {
          return resumeWriteRejectedResult(
            workspace,
            "当前尾行阶段缺少对应的 tailGrowths 或 lineRewrites",
          );
        }
        tailWriteHandled = true;
        tailRepairFeedback = processed.feedback;
        tailRepairDiagnostics = processed.diagnostics;
        tailRepairProgress = processed.progress;
        if (!processed.updates.length) {
          const retryWorkspace = store.replace(
            workspaceWithTailRepairProgress(workspace, processed.progress),
            workspace.revision,
          );
          return resumeWriteRejectedResult(
            retryWorkspace,
            processed.writeRejectedReason ?? "tailGrowths 没有产生真实尾行进展",
            {
              tailRepairFeedback,
              tailRepairDiagnostics: processed.diagnostics,
            },
          );
        }
        rewriteWarning = processed.writeRejectedReason;
        resolved = { bulletUpdates: processed.updates };
      }
      if (params.lineRewrites && !tailWriteHandled) {
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
        if (pageFillAttempt) {
          pageFillProgressMade = selected.diagnostics.heightGrowthCount > 0;
        }
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
      if (action.mode === "repair_bullet_counts") {
        const supplied = new Set(items.map((item) => item.itemId));
        const missing = action.itemIds.filter((itemId) => !supplied.has(itemId));
        const attemptsCountRepair = action.itemIds.some((itemId) =>
          supplied.has(itemId)
        );
        if (attemptsCountRepair && missing.length) {
          return resumeWriteRejectedResult(
            workspace,
            `repair_bullet_counts 必须在一次 items 调用中覆盖全部 itemTargets；missing=${missing.join(",")}`,
          );
        }
      }
      const applied = await applyAgentResumeContent({
        workspace,
        items,
        ...(tailRepairProgress ? { tailRepairProgress } : {}),
        compiler,
        store,
        pageFillAttempt,
        ...(pageFillProgressMade === undefined
          ? {}
          : { pageFillProgressMade }),
      });
      if (params.lineRewrites && lineRewriteDiagnostics) {
        const formal = formalLineRewriteOutcome(
          workspace, lineRewriteDiagnostics, applied.operation,
        );
        lineRewriteDiagnostics = formal.diagnostics;
        rewriteWarning = formal.warning;
      }
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
        ...(tailWriteHandled && tailRepairDiagnostics
          ? { tailRepairDiagnostics }
          : {}),
        ...(params.lineRewrites && lineRewriteDiagnostics
          ? { lineRewriteDiagnostics }
          : {}),
        ...(approvalRequestId ? { approvalRequestId } : {}),
      };
      return {
        content: [{
          type: "text",
          text: JSON.stringify(resumeWriteResultForModel(result)),
        }],
        details: {
          ...result,
          loopGuardKey: resumeWriteLoopGuardKey(
            applied.workspace,
            applied.operation,
          ),
          ...(["batch_tail_repair", "batch_tail_reflow"].includes(
              resumeAgentNextAction(applied.workspace).mode,
            )
            ? { turnGovernorPhaseKey: "resume_tail_repair" } : {}),
        },
      };
    },
  };
}
