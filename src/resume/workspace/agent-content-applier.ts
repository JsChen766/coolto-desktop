import type { ResumeCompiler } from "./compiler-port.js";
import { EvidenceLedger } from "../evidence-ledger.js";
import type {
  AgentAugmentedFragmentInput,
  AgentItemContentInput,
} from "./agent-content-types.js";
import {
  assertMinimumBulletCount,
  buildValidatedBullet,
} from "./agent-content-validation.js";
import type { ResumeWorkspace } from "./types.js";
import { ResumeWorkspaceStore } from "./workspace-store.js";
import type { WorkspaceOperationReceipt } from "./agent-workspace-view.js";
import { generationWorkspaceStatus } from "./generation-readiness.js";
import { reconcileAugmentedFragments } from "./augmentation-state.js";
import { tailRepairRetryForWorkspace } from "./tail-repair-ledger.js";
import type { TailRepairAttemptRecord } from "./tail-repair-state.js";
import { RESUME_LAYOUT_TOLERANCE_PX } from "../compiler-types.js";
import { recordPageFillOutcome } from "./page-fill-progress.js";

export async function applyAgentResumeContent(input: {
  workspace: ResumeWorkspace;
  items: readonly AgentItemContentInput[];
  augmentations?: readonly AgentAugmentedFragmentInput[];
  tailRepairAttempts?: readonly TailRepairAttemptRecord[];
  pageFillAttempt?: boolean;
  pageFillProgressMade?: boolean;
  compiler: ResumeCompiler;
  store: ResumeWorkspaceStore;
}): Promise<{ workspace: ResumeWorkspace; operation: WorkspaceOperationReceipt }> {
  const source = input.workspace;
  const structure = structuredClone(source.structure);
  const itemTiers = structuredClone(source.itemTiers ?? {});
  let bindings = structuredClone(source.bindings);
  let provenance = structuredClone(source.bulletProvenance ?? []);
  const appliedItemIds: string[] = [];
  const rejectedItems: Array<{ itemId: string; reason: string }> = [];
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
      if (rawItem.bullets.length === 0) {
        located.section.items.splice(located.index, 1);
        bindings = bindings.filter((binding) =>
          located.item.bullets.every((bullet) => bullet.id !== binding.bulletId),
        );
        provenance = provenance.filter((entry) => entry.itemId !== itemId);
        delete itemTiers[itemId];
        appliedItemIds.push(itemId);
        continue;
      }
      assertMinimumBulletCount(source, itemId, rawItem.bullets.length);
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
      const built = rawItem.bullets.map((bullet, index) =>
        buildValidatedBullet({
          source,
          item: located.item,
          bullet,
          index,
          retainedIds,
          retainedTexts,
        }),
      );
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
      candidateBindings.forEach((binding) => ledger.reserve(binding));
      located.item.bullets = built.map((entry) => entry.bullet);
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
  const operation = receipt(appliedItemIds, rejectedItems);
  if (!appliedItemIds.length) {
    const retry = input.tailRepairAttempts?.length
      ? tailRepairRetryForWorkspace(source, input.tailRepairAttempts)
      : undefined;
    const workspace = retry
      ? input.store.replace({ ...source, tailRepairRetry: retry }, source.revision)
      : source;
    return { workspace, operation };
  }
  structure.sections = structure.sections.filter((section) => section.items.length > 0);
  const compileResult = await input.compiler.compile(structure);
  const augmentedFragments = reconcileAugmentedFragments(
    source,
    structure,
    input.augmentations ?? [],
  );
  const revision = source.revision + 1;
  const { tailRepairRetry: _discardedTailRetry, ...stableSource } = source;
  void _discardedTailRetry;
  let updated: ResumeWorkspace = {
    ...stableSource,
    revision,
    patchCount: source.patchCount + 1,
    contentApplyCount: (source.contentApplyCount ?? 0) + 1,
    status: "writing",
    structure,
    bindings,
    bulletProvenance: provenance,
    augmentedFragments,
    compileResult,
    compileObservedRevision: revision,
    itemTiers,
    awaitingUserConfirmation: hasPending(provenance, augmentedFragments)
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
  if (input.tailRepairAttempts?.length) {
    const retry = tailRepairRetryForWorkspace(
      updated,
      input.tailRepairAttempts,
    );
    if (retry) updated.tailRepairRetry = retry;
  }
  updated.status = generationWorkspaceStatus(updated);
  if (input.pageFillAttempt) {
    updated = recordPageFillOutcome(
      updated,
      input.pageFillProgressMade ?? compileResult.usedHeightPx >
        source.compileResult.usedHeightPx + RESUME_LAYOUT_TOLERANCE_PX,
    );
  }
  return { workspace: input.store.replace(updated, source.revision), operation };
}

function hasPending(
  provenance: NonNullable<ResumeWorkspace["bulletProvenance"]>,
  fragments: NonNullable<ResumeWorkspace["augmentedFragments"]>,
): boolean {
  return provenance.some((entry) => entry.confirmation === "pending") ||
    fragments.some((entry) => entry.confirmation === "pending");
}

function assertSupplementalEvidenceUsedOnce(
  workspace: ResumeWorkspace,
  provenance: ResumeWorkspace["bulletProvenance"],
): void {
  const supplemental = new Set(
    (workspace.supplementalEvidence ?? []).map((entry) => entry.evidenceId),
  );
  const used = new Set<string>();
  for (const entry of provenance ?? []) {
    for (const evidenceId of entry.evidenceIds) {
      if (!supplemental.has(evidenceId)) continue;
      if (used.has(evidenceId)) {
        throw new Error(`用户补充 evidence 只能用于一条 bullet：${evidenceId}`);
      }
      used.add(evidenceId);
    }
  }
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

function receipt(
  appliedItemIds: string[],
  rejectedItems: Array<{ itemId: string; reason: string }>,
): WorkspaceOperationReceipt {
  return {
    status: appliedItemIds.length
      ? rejectedItems.length ? "partial_success" : "success"
      : "rejected",
    appliedItemIds,
    rejectedItems,
  };
}
