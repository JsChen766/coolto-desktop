import {
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";
import { resolveTailPolicy } from "../tail-policy.js";
import { resumeGenerationReadiness } from "./generation-readiness.js";
import { resumeAgentNextAction } from "./agent-next-action.js";
import type { ResumeWorkspace } from "./types.js";
import { normalizeResumeMaterialRequest } from "./material-request.js";
import { pendingAugmentedContent } from "./augmentation-state.js";
import { minimumResumeBulletCount } from "./bullet-count-rules.js";
export interface WorkspaceOperationReceipt {
  status: "success" | "partial_success" | "rejected";
  appliedItemIds: string[];
  rejectedItems: Array<{
    itemId: string;
    reason: string;
    errors?: WorkspaceBulletValidationError[];
  }>;
}
export interface WorkspaceBulletValidationError {
  bulletIndex: number;
  bulletId: string;
  code: string;
  message: string;
}
export function buildAgentWorkspaceView(
  workspace: ResumeWorkspace,
  operation?: WorkspaceOperationReceipt,
): object {
  const provenance = new Map(
    (workspace.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  const measurement = new Map(
    workspace.compileResult.bullets.map((entry) => [entry.bulletId, entry]),
  );
  const items = workspace.structure.sections.flatMap((section) =>
    section.items.map((item) => ({
      itemId: item.id,
      sectionType: section.type,
      sourceExperienceId: item.source_experience_id,
      tier: workspace.itemTiers?.[item.id] ?? null,
      title: item.title,
      organization: item.organization,
      role: item.role,
      rawText: item.raw_text,
      bullets: item.bullets.map((bullet) => {
        const source = provenance.get(bullet.id);
        const linePlan = workspace.bulletLinePlans?.[bullet.id];
        return {
          bulletId: bullet.id,
          text: bullet.text,
          origin: source?.origin ?? "grounded",
          evidenceIds: source?.evidenceIds ?? [],
          requirementIds: source?.requirementIds ?? [],
          confirmation: source?.confirmation ?? "not_required",
          plannedLines: linePlan?.plannedLines ?? null,
          lockedLines: linePlan?.lockedLines ?? null,
        };
      }),
    })),
  );
  const itemDiagnostics = items.flatMap((item) => {
    const minimumRequired = minimumResumeBulletCount({
      sectionType: item.sectionType, itemId: item.itemId,
      ...(item.tier ? { tier: item.tier } : {}),
    });
    return minimumRequired ? [{
        itemId: item.itemId,
        tier: item.tier ?? "skills",
        bulletCount: item.bullets.length,
        minimumRequired,
        passed: item.bullets.length >= minimumRequired,
    }] : [];
  });
  const bulletDiagnostics = items.flatMap((item) =>
    item.bullets.map((bullet) => {
      const observed = measurement.get(bullet.bulletId);
      const availableLineWidthPx = observed?.availableLineWidthPx ?? 0;
      const passed = observed?.passed ?? false;
      const policy = resolveTailPolicy(observed?.tailPolicyVersion);
      const ceuPx = observed?.ceuPx ?? 0;
      const hardDeficitPx = Math.max(
        0,
        availableLineWidthPx * policy.hardMinRatio -
          (observed?.lastLineWidthPx ?? 0),
      );
      const idealDeficitPx = Math.max(
        0,
        availableLineWidthPx * policy.repairIdealRatio -
          (observed?.lastLineWidthPx ?? 0),
      );
      return {
        bulletId: bullet.bulletId,
        lineCount: observed?.lineCount ?? 0,
        lastLineWidthPx: observed?.lastLineWidthPx ?? 0,
        availableLineWidthPx,
        lastLineRatio: observed?.lastLineRatio ?? 0,
        tailPolicyVersion: policy.version,
        ceuPx,
        minimumPassingTailWidthPx: round(
          availableLineWidthPx * policy.hardMinRatio,
        ),
        hardTailDeficitPx: round(hardDeficitPx),
        idealTailDeficitPx: round(idealDeficitPx),
        hardTailDeficitCjk: ceuPx > 0 ? round(hardDeficitPx / ceuPx) : 0,
        idealTailDeficitCjk: ceuPx > 0 ? round(idealDeficitPx / ceuPx) : 0,
        tailWidthDeficitPx: round(hardDeficitPx),
        passed,
      };
    }),
  );
  const compile = workspace.compileResult;
  const readiness = resumeGenerationReadiness(workspace);
  const bodyLineHeightPx = Math.max(1, compile.bodyLineHeightPx);
  const heightDeficitPx = Math.max(
    0,
    compile.availableHeightPx * RESUME_GLOBAL_MINIMUM_USAGE_RATIO -
      compile.usedHeightPx -
      RESUME_LAYOUT_TOLERANCE_PX,
  );
  const heightBeforeOverflowPx = Math.max(
    0,
    compile.availableHeightPx - compile.usedHeightPx,
  );
  const singlePage =
    compile.pageCount === 1 && compile.overflowPx <= RESUME_LAYOUT_TOLERANCE_PX;
  const minimumUsagePassed =
    compile.usedHeightPx + RESUME_LAYOUT_TOLERANCE_PX >=
    compile.availableHeightPx * RESUME_GLOBAL_MINIMUM_USAGE_RATIO;
  const bulletCountsPassed = itemDiagnostics.every((item) => item.passed);
  const bulletTailsPassed = bulletDiagnostics.every((bullet) => bullet.passed);
  const pendingConfirmation = pendingAugmentedContent(workspace);
  return {
    candidateId: workspace.candidateId,
    revision: workspace.revision,
    status: workspace.status,
    reuseBase: workspace.reuseBase ?? null,
    nextAction: resumeAgentNextAction(workspace),
    ...(workspace.materialRequest
      ? { materialRequest: normalizeResumeMaterialRequest(
          workspace.candidateId,
          workspace.materialRequest,
        ) }
      : {}),
    readiness: {
      ready: readiness.ready,
      blockers: readiness.blockers.map((blocker) => ({
        code: blocker.code,
        ...(blocker.itemId ? { itemId: blocker.itemId } : {}),
        ...(blocker.bulletId ? { bulletId: blocker.bulletId } : {}),
      })),
    },
    ...(operation ? { operation } : {}),
    resume: { items },
    layout: {
      observedRevision: workspace.compileObservedRevision ?? workspace.revision,
      pageCount: compile.pageCount,
      usedHeightPx: compile.usedHeightPx,
      availableHeightPx: compile.availableHeightPx,
      usageRatio: compile.usageRatio,
      overflowPx: compile.overflowPx,
      heightDeficitPx: round(heightDeficitPx),
      additionalBodyLinesToMinimum: Math.ceil(
        heightDeficitPx / bodyLineHeightPx,
      ),
      heightBeforeOverflowPx: round(heightBeforeOverflowPx),
      bodyLinesBeforeOverflow: Math.floor(
        heightBeforeOverflowPx / bodyLineHeightPx,
      ),
      gates: {
        singlePage,
        minimumUsagePassed,
        bulletCountsPassed,
        bulletTailsPassed,
      },
      items: itemDiagnostics,
      bullets: bulletDiagnostics,
      violations: [
        ...compile.violations.map((violation) => ({
          code: violation.code,
          ...(violation.bulletId ? { bulletId: violation.bulletId } : {}),
        })),
        ...itemDiagnostics
          .filter((item) => !item.passed)
          .map((item) => ({ code: "bullet_count_too_low", itemId: item.itemId })),
        ...pendingConfirmation.map((item) => ({
          code: "pending_augmented_confirmation",
          itemId: item.itemId,
          bulletId: item.bulletId,
        })),
      ],
    },
    pendingConfirmation,
  };
}
/** Compact receipt; full current content is recoverable through get_resume_workspace. */
export function buildAgentWorkspaceReceipt(
  workspace: ResumeWorkspace,
  operation?: WorkspaceOperationReceipt,
): object {
  const view = buildAgentWorkspaceView(workspace, operation) as {
    candidateId: string;
    revision: number;
    status: string;
    nextAction: object;
    readiness: object;
    operation?: WorkspaceOperationReceipt;
    layout: {
      observedRevision: number;
      pageCount: number;
      usageRatio: number;
      overflowPx: number;
      heightDeficitPx: number;
      additionalBodyLinesToMinimum: number;
      bodyLinesBeforeOverflow: number;
      gates: object;
      violations: object[];
    };
    pendingConfirmation: object[];
    materialRequest?: object;
  };
  return {
    candidateId: view.candidateId,
    revision: view.revision,
    status: view.status,
    nextAction: view.nextAction,
    readiness: view.readiness,
    ...(view.operation ? { operation: view.operation } : {}),
    layout: {
      observedRevision: view.layout.observedRevision,
      pageCount: view.layout.pageCount,
      usageRatio: view.layout.usageRatio,
      overflowPx: view.layout.overflowPx,
      heightDeficitPx: view.layout.heightDeficitPx,
      additionalBodyLinesToMinimum:
        view.layout.additionalBodyLinesToMinimum,
      bodyLinesBeforeOverflow: view.layout.bodyLinesBeforeOverflow,
      gates: view.layout.gates,
      violations: view.layout.violations,
    },
    pendingConfirmation: view.pendingConfirmation,
    ...(view.materialRequest ? { materialRequest: view.materialRequest } : {}),
    recovery: "需要完整当前简历时调用 get_resume_workspace；正常循环直接按 nextAction 批量继续",
  };
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
