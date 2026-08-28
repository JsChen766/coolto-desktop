import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ApprovalManager } from "../../approvals/approval-manager.js";
import { applyAgentResumeContent } from "../../resume/workspace/agent-content-applier.js";
import { buildAgentWorkspaceReceipt } from "../../resume/workspace/agent-workspace-view.js";
import { resumeAgentNextAction } from "../../resume/workspace/agent-next-action.js";
import { resumeWriteRejection } from "../../resume/workspace/agent-write-rejection.js";
import { selectLineRewrites } from "../../resume/workspace/line-rewrite-selector.js";
import { pageFillExpansionRewrites } from "../../resume/workspace/page-fill-expansion-input.js";
import { formalLineRewriteOutcome } from "../../resume/workspace/line-rewrite-formal-outcome.js";
import { attachRejectedLineExpansionAttempts } from "../../resume/workspace/line-expansion-attempt-feedback.js";
import type { SemanticTailRewriteFeedback } from "../../resume/workspace/semantic-tail-rewrite-types.js";
import type { TailRepairProgressState } from "../../resume/workspace/tail-repair-state.js";
import { processTailWrite, type TailWriteDiagnostics, type TailWriteResult } from "../../resume/workspace/tail-write-processor.js";
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
import { mergeFactNeutralFragments, safeFactNeutralFragmentsForWrite } from "./fact-neutral-write.js";
import { isFirstResumeGeneration } from "../../resume/workspace/first-generation-policy.js";
export function createApplyResumeContentTool(compiler: ResumeCompiler, store: ResumeWorkspaceStore, approvalManager?: ApprovalManager): AgentTool<typeof parameters> {
  return {
    name: "apply_resume_content",
    label: "批量写入简历内容",
    description:
      "批量写入并真实测量简历。首稿提交 plannedLines；篇幅阶段用 lineExpansions；尾行阶段用 tailRewrites 提交最多两份完整事实等价改写，由宿主真实测量并择优。",
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
        params.bulletAdditions, params.tailGrowths, params.lineExpansions,
        params.lineRewrites, params.tailRewrites]
        .filter((value) => value?.length).length;
      if (modeCount !== 1) {
        return resumeWriteRejectedResult(
          workspace,
          "items、bulletUpdates、bulletRemovals、bulletAdditions、tailGrowths、lineExpansions、lineRewrites、tailRewrites 必须且只能提供一种",
        );
      }
      const rejectedReason = resumeWriteRejection(workspace, params);
      if (rejectedReason) {
        return resumeWriteRejectedResult(workspace, rejectedReason);
      }
      let resolved: Parameters<typeof resolveResumeContentChanges>[1] = params;
      let rewriteWarning: string | undefined;
      let tailRepairFeedback: SemanticTailRewriteFeedback[] | undefined;
      let tailRepairDiagnostics: TailWriteDiagnostics | undefined;
      let tailRepairProgress: TailRepairProgressState | undefined;
      let lineRewriteDiagnostics;
      let pageFillProgressMade: boolean | undefined;
      let tailNeutralFragments: TailWriteResult["factNeutralFragments"];
      let tailWriteHandled = false;
      const tailWriteRequested = Boolean(params.tailRewrites?.length);
      if (tailWriteRequested) {
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
            "当前尾行阶段缺少对应的 tailRewrites",
          );
        }
        tailWriteHandled = true;
        tailRepairFeedback = processed.feedback;
        tailRepairDiagnostics = processed.diagnostics;
        tailRepairProgress = processed.progress;
        tailNeutralFragments = processed.factNeutralFragments;
        if (!processed.updates.length) {
          const retryWorkspace = store.replace(
            workspaceWithTailRepairProgress(workspace, processed.progress),
            workspace.revision,
          );
          return resumeWriteRejectedResult(
            retryWorkspace,
            processed.writeRejectedReason ?? "尾行写入没有产生真实进展",
            {
              tailRepairFeedback,
              tailRepairDiagnostics: processed.diagnostics,
            },
          );
        }
        rewriteWarning = processed.writeRejectedReason;
        resolved = { bulletUpdates: processed.updates };
      }
      if ((params.lineExpansions || params.lineRewrites) && !tailWriteHandled) {
        let rewriteInputs = params.lineRewrites;
        try {
          rewriteInputs ??= params.lineExpansions
            ? pageFillExpansionRewrites(workspace, params.lineExpansions)
            : undefined;
        } catch (error: unknown) {
          return resumeWriteRejectedResult(
            workspace,
            error instanceof Error ? error.message : String(error),
          );
        }
        const selected = await selectLineRewrites(
          workspace, rewriteInputs ?? [], compiler, { goal: "page_fill" },
        );
        lineRewriteDiagnostics = attachRejectedLineExpansionAttempts(
          selected.diagnostics,
          params.lineExpansions,
        );
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
      const neutralWrite = safeFactNeutralFragmentsForWrite(
        workspace, params, resolved.bulletUpdates, pageFillAttempt,
      );
      if (neutralWrite.error) {
        return resumeWriteRejectedResult(workspace, neutralWrite.error);
      }
      const factNeutralFragments = mergeFactNeutralFragments(
        tailNeutralFragments, neutralWrite.fragments,
      );
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
        ...(factNeutralFragments.length
          ? { factNeutralFragments } : {}),
        allowPartialItemProgress: isFirstResumeGeneration(workspace) && (action.mode === "repair_bullet_counts" || action.mode === "integrate_supplemental_evidence"),
      });
      if ((params.lineExpansions || params.lineRewrites) &&
        lineRewriteDiagnostics) {
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
        ...((params.lineExpansions || params.lineRewrites) &&
          lineRewriteDiagnostics
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
          ...(tailWriteHandled
            ? { turnGovernorPhaseKey: "resume_tail_repair" } : {}),
        },
      };
    },
  };
}
