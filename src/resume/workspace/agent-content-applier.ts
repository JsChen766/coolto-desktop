import type { ResumeCompiler } from "./compiler-port.js";
import { EvidenceLedger } from "../evidence-ledger.js";
import type { AgentAugmentedFragmentInput, AgentItemContentInput } from "./agent-content-types.js";
import type { ResumeWorkspace } from "./types.js";
import { ResumeWorkspaceStore } from "./workspace-store.js";
import type { WorkspaceOperationReceipt } from "./agent-workspace-view.js";
import { generationWorkspaceStatus } from "./generation-readiness.js";
import { reconcileAugmentedFragments } from "./augmentation-state.js";
import { retainFailedTailProgress, type TailRepairProgressState } from "./tail-repair-state.js";
import { workspaceWithTailRepairProgress } from "./tail-repair-workspace.js";
import { RESUME_LAYOUT_TOLERANCE_PX } from "../compiler-types.js";
import { recordPageFillOutcome } from "./page-fill-progress.js";
import { validateAgentItemBullets } from "./agent-item-validation.js";
import { lockMeasuredBulletLines } from "./bullet-line-plan.js";
import { removeBulletLinePlans, replaceBulletLinePlans } from "./agent-line-plan-reconciler.js";
import { assertSupplementalEvidenceUsedOnce, hasPendingAgentContent, supplementalNumericEvidenceForBullet } from "./agent-content-state.js";
import type { ResumeFactNeutralFragment } from "./fact-neutral-types.js";
import { reconcileFactNeutralFragments, withFactNeutralFragments } from "./fact-neutral-fragments.js";
import { applyBulletCountMaterialGate } from "./material-request-gate.js";
import { applyMaterialFollowUpGate } from "./material-follow-up.js";
import { applyCriticalSkillGate } from "./critical-skill-gate.js";
import { reconcileReuseAdaptation } from "./reuse-adaptation.js";
import { syncEvidenceAssessment } from "./evidence-assessment.js";
import { persistRejectedSelectedEvidence } from "./evidence-write-rejection.js";
import { workspaceOperationReceipt } from "./agent-operation-receipt.js";
export async function applyAgentResumeContent(input: {
  workspace: ResumeWorkspace;
  items: readonly AgentItemContentInput[];
  augmentations?: readonly AgentAugmentedFragmentInput[];
  tailRepairProgress?: TailRepairProgressState;
  pageFillAttempt?: boolean;
  pageFillProgressMade?: boolean;
  factNeutralFragments?: readonly ResumeFactNeutralFragment[];
  allowPartialItemProgress?: boolean;
  compiler: ResumeCompiler;
  store: ResumeWorkspaceStore;
}): Promise<{ workspace: ResumeWorkspace; operation: WorkspaceOperationReceipt }> {
  const source = input.workspace;
  const validationSource = withFactNeutralFragments(
    source,
    input.factNeutralFragments ?? [],
  );
  const structure = structuredClone(source.structure);
  const itemTiers = structuredClone(source.itemTiers ?? {});
  let bindings = structuredClone(source.bindings);
  let provenance = structuredClone(source.bulletProvenance ?? []);
  let bulletLinePlans = structuredClone(source.bulletLinePlans ?? {});
  const appliedItemIds: string[] = [];
  const rejectedItems: WorkspaceOperationReceipt["rejectedItems"] = [];
  const seenItems = new Set<string>();
  for (const rawItem of input.items) {
    const itemId = rawItem.itemId.trim();
    if (!itemId || seenItems.has(itemId)) {
      rejectedItems.push({ itemId, reason: "itemId 为空或在本批次中重复" });
      continue;
    }
    seenItems.add(itemId);
    const located = locateItem(structure, itemId);
    if (!located) {
      rejectedItems.push({ itemId, reason: "item 不在当前工作区" });
      continue;
    }
    try {
      if (located.section.type === "education") {
        throw new Error("教育信息由经历库固定展示，不能在简历生成中改写或删除");
      }
      if (
        source.lineBudgetVersion === "item-lines-v1" &&
        source.itemLineBudgets?.[itemId] &&
        rawItem.bullets.length === 0
      ) {
        throw new Error("被选中的经历至少需要一个有证据支持的独立工作单元");
      }
      if (rawItem.bullets.length === 0) {
        located.section.items.splice(located.index, 1);
        bindings = bindings.filter((binding) =>
          located.item.bullets.every((bullet) => bullet.id !== binding.bulletId),
        );
        provenance = provenance.filter((entry) => entry.itemId !== itemId);
        removeBulletLinePlans(
          bulletLinePlans,
          located.item.bullets.map((bullet) => bullet.id),
        );
        delete itemTiers[itemId];
        appliedItemIds.push(itemId);
        continue;
      }
      const retainedIds = new Set(
        structure.sections.flatMap((section) =>
          section.items.flatMap((item) =>
            item.id === itemId ? [] : item.bullets.map((bullet) => bullet.id),
          ),
        ),
      );
      const retainedTexts = structure.sections.flatMap((section) =>
        section.items.flatMap((item) =>
          item.id === itemId ? [] : item.bullets.map((bullet) => normalized(bullet.text)),
        ),
      );
      const validation = validateAgentItemBullets({
        source: validationSource,
        item: located.item,
        bullets: rawItem.bullets,
        bindings,
        provenance,
        retainedIds,
        retainedTexts,
      });
      if (validation.errors.length) {
        rejectedItems.push({
          itemId,
          reason: validation.errors.map((error) =>
            `bullet[${error.bulletIndex}] ${error.message}`
          ).join("；"),
          errors: validation.errors,
        });
        if (!input.allowPartialItemProgress ||
          validation.built.length <= located.item.bullets.length) continue;
      }
      const built = validation.built;
      const oldIds = new Set(located.item.bullets.map((bullet) => bullet.id));
      const candidateBindings = [
        ...bindings.filter((binding) => !oldIds.has(binding.bulletId)),
        ...built.flatMap((entry) => entry.binding ?? []),
      ];
      const candidateProvenance = [
        ...provenance.filter((entry) => entry.itemId !== itemId),
        ...built.map((entry) => entry.provenance),
      ];
      assertSupplementalEvidenceUsedOnce(source, candidateProvenance);
      const ledger = new EvidenceLedger(source.sourceSnapshot);
      candidateBindings.forEach((binding) => ledger.reserve(binding,
        supplementalNumericEvidenceForBullet(
          source, candidateProvenance, binding.bulletId,
          binding.sourceExperienceId,
        )));
      located.item.bullets = built.map((entry) => entry.bullet);
      replaceBulletLinePlans({
        plans: bulletLinePlans,
        previous: source.bulletLinePlans,
        oldBulletIds: oldIds,
        built,
      });
      bindings = [...ledger.listBindings()];
      provenance = candidateProvenance;
      appliedItemIds.push(itemId);
    } catch (error: unknown) {
      rejectedItems.push({
        itemId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const operation = workspaceOperationReceipt(appliedItemIds, rejectedItems);
  if (!appliedItemIds.length) {
    const workspace = input.tailRepairProgress
      ? input.store.replace(
          workspaceWithTailRepairProgress(source, input.tailRepairProgress),
          source.revision,
        )
      : persistRejectedSelectedEvidence(input.store, source, input.items, rejectedItems);
    return { workspace, operation };
  }
  structure.sections = structure.sections.filter((section) => section.items.length > 0);
  const compileResult = await input.compiler.compile(structure);
  bulletLinePlans = lockMeasuredBulletLines(bulletLinePlans, compileResult);
  const augmentedFragments = reconcileAugmentedFragments(
    source,
    structure,
    input.augmentations ?? [],
  );
  const factNeutralFragments = reconcileFactNeutralFragments(
    validationSource,
    structure,
  );
  const revision = source.revision + 1;
  const { tailRepairProgress: _discardedTailProgress, ...stableSource } = source;
  void _discardedTailProgress;
  let updated: ResumeWorkspace = {
    ...stableSource,
    revision,
    patchCount: source.patchCount + 1,
    contentApplyCount: (source.contentApplyCount ?? 0) + 1,
    status: "writing",
    structure,
    bindings,
    bulletProvenance: provenance,
    bulletLinePlans,
    augmentedFragments,
    factNeutralFragments,
    compileResult,
    compileObservedRevision: revision,
    itemTiers,
    awaitingUserConfirmation: hasPendingAgentContent(
      provenance,
      augmentedFragments,
    )
      ? { note: "agent_augmented content requires confirmation" }
      : null,
    lastOperationReport: {
      status: rejectedItems.length ? "partial_success" : "success",
      attempted: input.items.length,
      applied: appliedItemIds.length,
      repairs: [],
      rejected: rejectedItems.map((item, index) => ({ index, message: item.reason })),
    },
    bestSnapshot: {
      revision,
      structure: structuredClone(structure),
      bindings: structuredClone(bindings),
      compileResult: structuredClone(compileResult),
    },
  };
  updated = reconcileReuseAdaptation(source, updated, appliedItemIds);
  updated.status = generationWorkspaceStatus(updated);
  if (input.tailRepairProgress) {
    const failedIds = new Set(compileResult.bullets
      .filter((bullet) => !bullet.passed)
      .map((bullet) => bullet.bulletId));
    const progress = retainFailedTailProgress(
      input.tailRepairProgress,
      failedIds,
    );
    if (progress) updated = workspaceWithTailRepairProgress(updated, progress);
  }
  if (input.pageFillAttempt) {
    updated = recordPageFillOutcome(
      updated,
      input.pageFillProgressMade ?? compileResult.usedHeightPx >
        source.compileResult.usedHeightPx + RESUME_LAYOUT_TOLERANCE_PX,
    );
  }
  updated = applyMaterialFollowUpGate(applyBulletCountMaterialGate(
    applyCriticalSkillGate(updated),
  ));
  updated = syncEvidenceAssessment(updated);
  return { workspace: input.store.replace(updated, source.revision), operation };
}
function locateItem(structure: ResumeWorkspace["structure"], itemId: string) {
  for (const section of structure.sections) {
    const index = section.items.findIndex((item) => item.id === itemId);
    if (index >= 0) return { section, index, item: section.items[index]! };
  }
  return undefined;
}
function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
