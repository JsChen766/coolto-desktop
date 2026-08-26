import { applyAgentResumeContent } from "../../resume/workspace/agent-content-applier.js";
import { workspaceEvidenceRecords } from "../../resume/workspace/agent-workspace-evidence.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";

type Workspace = ReturnType<ResumeWorkspaceStore["get"]>;
type BulletInput = Parameters<
  typeof applyAgentResumeContent
>[0]["items"][number]["bullets"][number];

interface ItemInput {
  itemId?: string;
  experienceId?: string;
  bullets: readonly BulletInput[];
}

interface BulletAddition extends Omit<BulletInput, "bulletId"> {
  itemId: string;
}

export function resolveResumeContentChanges(
  workspace: Workspace,
  params: {
    items?: readonly ItemInput[];
    bulletUpdates?: readonly BulletUpdate[];
    bulletRemovals?: readonly { bulletId: string }[];
    bulletAdditions?: readonly BulletAddition[];
  },
) {
  const modes = [
    Boolean(params.items?.length),
    Boolean(params.bulletUpdates?.length),
    Boolean(params.bulletRemovals?.length),
    Boolean(params.bulletAdditions?.length),
  ].filter(Boolean).length;
  if (modes !== 1) {
    throw new Error(
      "items、bulletUpdates、bulletRemovals、bulletAdditions 必须且只能提供一种",
    );
  }
  if (params.items?.length) return resolveItemIds(workspace, params.items);
  if (params.bulletUpdates?.length) {
    return expandBulletUpdates(workspace, params.bulletUpdates);
  }
  if (params.bulletRemovals?.length) {
    return expandBulletRemovals(workspace, params.bulletRemovals);
  }
  return expandBulletAdditions(workspace, params.bulletAdditions!);
}

function expandBulletUpdates(
  workspace: Workspace,
  updates: readonly BulletUpdate[],
) {
  const seen = new Set<string>();
  const byItem = new Map<string, Map<string, BulletUpdateValue>>();
  for (const update of updates) {
    const bulletId = update.bulletId.trim();
    if (!bulletId || seen.has(bulletId)) {
      throw new Error(`bulletId 为空或在本批次中重复：${bulletId}`);
    }
    seen.add(bulletId);
    const item = locateBulletItem(workspace, bulletId);
    const changes = byItem.get(item.id) ??
      new Map<string, BulletUpdateValue>();
    changes.set(bulletId, {
      text: update.text,
      ...(update.evidenceIds ? { evidenceIds: update.evidenceIds } : {}),
    });
    byItem.set(item.id, changes);
  }
  return changedItems(workspace, byItem, new Map(), new Map());
}

function expandBulletRemovals(
  workspace: Workspace,
  removals: readonly { bulletId: string }[],
) {
  const seen = new Set<string>();
  const byItem = new Map<string, Set<string>>();
  for (const removal of removals) {
    const bulletId = removal.bulletId.trim();
    if (!bulletId || seen.has(bulletId)) {
      throw new Error(`bulletId 为空或在本批次中重复：${bulletId}`);
    }
    seen.add(bulletId);
    const item = locateBulletItem(workspace, bulletId);
    const removed = byItem.get(item.id) ?? new Set<string>();
    removed.add(bulletId);
    byItem.set(item.id, removed);
  }
  return changedItems(workspace, new Map(), new Map(), byItem);
}

function expandBulletAdditions(
  workspace: Workspace,
  additions: readonly BulletAddition[],
) {
  const byItem = new Map<string, BulletInput[]>();
  for (const addition of additions) {
    const item = workspace.structure.sections.flatMap((section) =>
      section.items.filter((candidate) => candidate.id === addition.itemId),
    );
    if (item.length !== 1) throw new Error(`item ${addition.itemId} 不在当前工作区`);
    const current = byItem.get(addition.itemId) ?? [];
    current.push({
      text: addition.text,
      origin: addition.origin,
      ...(addition.evidenceIds ? { evidenceIds: addition.evidenceIds } : {}),
      ...(addition.requirementIds
        ? { requirementIds: addition.requirementIds }
        : {}),
    });
    byItem.set(addition.itemId, current);
  }
  return changedItems(workspace, new Map(), byItem, new Map());
}

function changedItems(
  workspace: Workspace,
  updates: ReadonlyMap<string, ReadonlyMap<string, BulletUpdateValue>>,
  additions: ReadonlyMap<string, readonly BulletInput[]>,
  removals: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const provenance = new Map(
    (workspace.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  return workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => {
      const changes = updates.get(item.id);
      const added = additions.get(item.id);
      const removed = removals.get(item.id);
      if (!changes && !added && !removed) return [];
      const bullets = item.bullets.filter((bullet) => !removed?.has(bullet.id))
        .map((bullet) => {
          const source = provenance.get(bullet.id);
          if (!source) {
            throw new Error(`bullet ${bullet.id} 缺少来源记录，不能局部修改`);
          }
          return {
            bulletId: bullet.id,
            text: changes?.get(bullet.id)?.text ?? bullet.text,
            origin: source.origin,
            evidenceIds: [...(changes?.get(bullet.id)?.evidenceIds ??
              source.evidenceIds)],
            requirementIds: source.requirementIds,
          };
        });
      return [{ itemId: item.id, bullets: [...bullets, ...(added ?? [])] }];
    }),
  );
}

interface BulletUpdate {
  bulletId: string;
  text: string;
  evidenceIds?: readonly string[];
}

interface BulletUpdateValue {
  text: string;
  evidenceIds?: readonly string[];
}

function locateBulletItem(workspace: Workspace, bulletId: string) {
  const located = workspace.structure.sections.flatMap((section) =>
    section.items.filter((item) =>
      item.bullets.some((bullet) => bullet.id === bulletId),
    ),
  );
  if (located.length !== 1) throw new Error(`bullet ${bulletId} 不在当前工作区`);
  return located[0]!;
}

function resolveItemIds(workspace: Workspace, items: readonly ItemInput[]) {
  const evidenceOwners = new Map(
    workspaceEvidenceRecords(
      workspace.sourceSnapshot,
      workspace.supplementalEvidence ?? [],
    ).map((record) => [record.evidenceId, record.experienceId]),
  );
  return items.map((item) => {
    if (item.itemId) return { itemId: item.itemId, bullets: item.bullets };
    const experienceId = item.experienceId ?? inferExperienceId(
      workspace,
      item.bullets,
      evidenceOwners,
    );
    if (!experienceId) throw new Error(
      "每个 items 条目必须包含 itemId、experienceId，或可唯一定位经历的 bulletId/evidenceIds",
    );
    const matches = workspace.structure.sections.flatMap((section) =>
      section.items.filter(
        (candidate) => candidate.source_experience_id === experienceId,
      ),
    );
    if (matches.length !== 1) {
      throw new Error(
        `经历 ${experienceId} 对应 ${matches.length} 个简历 item，请改传明确 itemId`,
      );
    }
    return { itemId: matches[0]!.id, bullets: item.bullets };
  });
}

function inferExperienceId(
  workspace: Workspace,
  bullets: readonly BulletInput[],
  evidenceOwners: ReadonlyMap<string, string>,
): string | undefined {
  const inferred = new Set<string>();
  for (const bullet of bullets) {
    if (bullet.bulletId) {
      const item = locateBulletItem(workspace, bullet.bulletId);
      if (item.source_experience_id) inferred.add(item.source_experience_id);
    }
    for (const evidenceId of bullet.evidenceIds ?? []) {
      const owner = evidenceOwners.get(evidenceId);
      if (owner) inferred.add(owner);
    }
  }
  return inferred.size === 1 ? [...inferred][0] : undefined;
}
