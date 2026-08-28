import { pendingAugmentedContent } from "./augmentation-state.js";
import { minimumResumeBulletCount } from "./bullet-count-rules.js";
import type { ResumeCompiler } from "./compiler-port.js";
import type { ResumeWorkspace } from "./types.js";

/** Drops evidence-poor first-generation items after the user opts out. */
export async function pruneUnderSupportedFirstGenerationItems(
  workspace: ResumeWorkspace,
  compiler: ResumeCompiler,
): Promise<ResumeWorkspace> {
  if (workspace.reuseBase) return workspace;
  const removedItemIds = new Set(workspace.structure.sections.flatMap(
    (section) => section.items.flatMap((item) => {
      const tier = workspace.itemTiers?.[item.id];
      if (!tier) return [];
      const minimum = minimumResumeBulletCount({
        sectionType: section.type,
        itemId: item.id,
        tier,
      });
      return item.bullets.length < minimum ? [item.id] : [];
    }),
  ));
  if (!removedItemIds.size) return workspace;
  const tieredItemIds = new Set(Object.keys(workspace.itemTiers ?? {}));
  if ([...tieredItemIds].every((itemId) => removedItemIds.has(itemId))) {
    throw new Error(
      "现有工作/项目经历全部低于最低真实 bullet 数，不能在不降低数量门槛或编造事实的情况下完成",
    );
  }
  const removedBulletIds = new Set(workspace.structure.sections.flatMap(
    (section) => section.items.flatMap((item) =>
      removedItemIds.has(item.id) ? item.bullets.map((bullet) => bullet.id) : []
    ),
  ));
  const structure = structuredClone(workspace.structure);
  structure.sections = structure.sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => !removedItemIds.has(item.id)),
  })).filter((section) => section.items.length);
  const bindings = workspace.bindings.filter(
    (binding) => !removedBulletIds.has(binding.bulletId),
  );
  const compileResult = await compiler.compile(structure);
  const filtered = <T extends { bulletId: string }>(items: readonly T[] = []) =>
    items.filter((item) => !removedBulletIds.has(item.bulletId));
  const next: ResumeWorkspace = {
    ...workspace,
    structure,
    bindings,
    compileResult,
    compileObservedRevision: workspace.revision,
    bestSnapshot: {
      revision: workspace.revision,
      structure: structuredClone(structure),
      bindings: structuredClone(bindings),
      compileResult: structuredClone(compileResult),
    },
    itemTiers: Object.fromEntries(Object.entries(workspace.itemTiers ?? {})
      .filter(([itemId]) => !removedItemIds.has(itemId))),
    bulletProvenance: filtered(workspace.bulletProvenance),
    bulletLinePlans: Object.fromEntries(Object.entries(
      workspace.bulletLinePlans ?? {},
    ).filter(([bulletId]) => !removedBulletIds.has(bulletId))),
    augmentedBullets: filtered(workspace.augmentedBullets),
    augmentedFragments: filtered(workspace.augmentedFragments),
    factNeutralFragments: filtered(workspace.factNeutralFragments),
  };
  next.awaitingUserConfirmation = pendingAugmentedContent(next).length
    ? workspace.awaitingUserConfirmation ?? {
        note: "agent_augmented content requires confirmation",
      }
    : null;
  return next;
}
