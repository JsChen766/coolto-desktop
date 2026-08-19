import type { AgentAugmentedFragmentInput } from "./agent-content-types.js";
import type {
  ResumeAugmentedFragment,
  ResumeWorkspace,
} from "./types.js";

export interface PendingAugmentedContent {
  bulletId: string;
  itemId: string;
  text: string;
  kind: "bullet" | "fragment";
}

export function pendingAugmentedContent(
  workspace: ResumeWorkspace,
): PendingAugmentedContent[] {
  const itemByBullet = new Map(
    workspace.structure.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.bullets.map((bullet) => [bullet.id, item.id] as const),
      ),
    ),
  );
  const textByBullet = new Map(
    workspace.structure.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.bullets.map((bullet) => [bullet.id, bullet.text] as const),
      ),
    ),
  );
  const provenanceByBullet = new Map(
    (workspace.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  const bullets = (workspace.bulletProvenance ?? []).flatMap((entry) => {
    const itemId = itemByBullet.get(entry.bulletId);
    const textValue = textByBullet.get(entry.bulletId);
    return entry.origin === "agent_augmented" &&
        entry.confirmation === "pending" && itemId && textValue
      ? [{
          bulletId: entry.bulletId,
          itemId,
          text: textValue,
          kind: "bullet" as const,
        }]
      : [];
  });
  const fragments = (workspace.augmentedFragments ?? []).flatMap((entry) => {
    const itemId = itemByBullet.get(entry.bulletId);
    const provenance = provenanceByBullet.get(entry.bulletId);
    return entry.confirmation === "pending" && itemId &&
        provenance?.origin !== "agent_augmented"
      ? [{
          bulletId: entry.bulletId,
          itemId,
          text: entry.fragmentText,
          kind: "fragment" as const,
        }]
      : [];
  });
  return [...bullets, ...fragments];
}

export function hasPendingAugmentedContent(workspace: ResumeWorkspace): boolean {
  return pendingAugmentedContent(workspace).length > 0;
}

export function reconcileAugmentedFragments(
  source: ResumeWorkspace,
  structure: ResumeWorkspace["structure"],
  selected: readonly AgentAugmentedFragmentInput[],
): ResumeAugmentedFragment[] {
  const textByBullet = new Map(structure.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.bullets.map((bullet) => [bullet.id, bullet.text] as const),
    ),
  ));
  const selectedIds = new Set(selected.map((entry) => entry.bulletId));
  const provenanceByBullet = new Map(
    (source.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  const retained = (source.augmentedFragments ?? []).filter((entry) =>
    !selectedIds.has(entry.bulletId) &&
    provenanceByBullet.get(entry.bulletId)?.origin !== "agent_augmented" &&
    textByBullet.get(entry.bulletId) === entry.appliedText,
  );
  const previous = new Map(
    (source.augmentedFragments ?? []).map((entry) => [entry.bulletId, entry]),
  );
  const added = selected.flatMap((entry) => {
    if (provenanceByBullet.get(entry.bulletId)?.origin === "agent_augmented") {
      return [];
    }
    if (textByBullet.get(entry.bulletId) !== entry.appliedText) return [];
    const prior = previous.get(entry.bulletId);
    const confirmation = prior?.confirmation === "confirmed" &&
      prior.appliedText === entry.appliedText &&
      prior.fragmentText === entry.fragmentText
      ? "confirmed" as const
      : "pending" as const;
    return [{
      bulletId: entry.bulletId,
      baseText: entry.baseText,
      fragmentText: entry.fragmentText,
      appliedText: entry.appliedText,
      requirementIds: [...new Set(entry.requirementIds)],
      confirmation,
    }];
  });
  return [...retained, ...added];
}
