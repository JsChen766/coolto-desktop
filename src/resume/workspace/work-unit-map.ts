import { structuralEvidenceCandidates } from "../quality/evidence-candidates.js";
import { sha256, stableStringify } from "../stable-snapshot.js";
import type { ResumeWorkspace } from "./types.js";
import type {
  ResumeWorkUnit,
  ResumeWorkUnitInput,
  ResumeWorkUnitMap,
} from "./work-unit-types.js";

export function pendingResumeWorkUnitMap(
  sourceFingerprint: string,
): ResumeWorkUnitMap {
  return {
    version: "work-units-v1",
    sourceFingerprint,
    status: "pending",
    units: [],
  };
}

export function workUnitGroupingAction(workspace: ResumeWorkspace) {
  if (workspace.workUnitMap?.status !== "pending") return undefined;
  const evidence = [
    ...structuralEvidenceCandidates(workspace.sourceSnapshot),
    ...(workspace.supplementalEvidence ?? []).map((entry) => ({
      evidenceId: entry.evidenceId,
      experienceId: entry.experienceId,
      sourceQuote: entry.text,
    })),
  ];
  const itemTargets = workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => {
      const experienceId = item.source_experience_id;
      if (!experienceId || !workspace.itemTiers?.[item.id]) return [];
      return [{
        itemId: item.id,
        sourceExperienceId: experienceId,
        title: item.title,
        organization: item.organization,
        evidence: evidence.filter((entry) =>
          entry.experienceId === experienceId
        ).map((entry) => ({
          evidenceId: entry.evidenceId,
          text: entry.sourceQuote,
        })),
        requiredEdit: [
          "把本 Experience 的 evidence 完整分成项目、报告、独立职责或交付物",
          "同一项目/报告的背景、方法、数据、分析与结果必须属于同一 WorkUnit",
          "每个 evidenceId 必须且只能出现一次；不确定时宁可合并为较大的 WorkUnit",
        ].join("；"),
      }];
    }),
  );
  return {
    mode: "group_work_units" as const,
    requiredInput: "workUnits" as const,
    itemIds: itemTargets.map((target) => target.itemId),
    itemTargets,
  };
}

export function applyResumeWorkUnitInputs(
  workspace: ResumeWorkspace,
  inputs: readonly ResumeWorkUnitInput[],
): ResumeWorkspace {
  const action = workUnitGroupingAction(workspace);
  if (!action) throw new Error("当前工作区不需要提交 WorkUnit 语义分组");
  const supplied = new Map<string, ResumeWorkUnitInput>();
  for (const input of inputs) {
    if (supplied.has(input.itemId)) {
      throw new Error(`WorkUnit itemId 重复：${input.itemId}`);
    }
    supplied.set(input.itemId, input);
  }
  const missing = action.itemIds.filter((itemId) => !supplied.has(itemId));
  const extra = [...supplied.keys()].filter((itemId) =>
    !action.itemIds.includes(itemId)
  );
  if (missing.length || extra.length) {
    throw new Error(
      `WorkUnit 分组必须覆盖全部 itemTargets；missing=${missing.join(",") || "none"}；extra=${extra.join(",") || "none"}`,
    );
  }
  const units = action.itemTargets.flatMap((target) =>
    validateItemUnits(target, supplied.get(target.itemId)!),
  );
  const revision = workspace.revision + 1;
  return {
    ...workspace,
    revision,
    compileObservedRevision: revision,
    bestSnapshot: { ...workspace.bestSnapshot, revision },
    workUnitMap: {
      version: "work-units-v1",
      sourceFingerprint: workspace.sourceSnapshot.sourceFingerprint,
      status: "ready",
      units,
    },
  };
}

function validateItemUnits(
  target: NonNullable<ReturnType<typeof workUnitGroupingAction>>["itemTargets"][number],
  input: ResumeWorkUnitInput,
): ResumeWorkUnit[] {
  if (!input.units.length) throw new Error(`item ${input.itemId} 至少需要一个 WorkUnit`);
  const allowed = new Set(target.evidence.map((entry) => entry.evidenceId));
  const seen = new Set<string>();
  const units = input.units.map((unit) => {
    const label = unit.label.trim();
    if (!label) throw new Error(`item ${input.itemId} 的 WorkUnit label 不能为空`);
    const evidenceIds = [...new Set(unit.evidenceIds.map((id) => id.trim()))];
    if (!evidenceIds.length) throw new Error(`WorkUnit ${label} 至少需要一个 evidenceId`);
    const unknown = evidenceIds.filter((id) => !allowed.has(id));
    const duplicate = evidenceIds.filter((id) => seen.has(id));
    if (unknown.length || duplicate.length) {
      throw new Error(
        `WorkUnit ${label} evidence 非法；unknown=${unknown.join(",") || "none"}；duplicate=${duplicate.join(",") || "none"}`,
      );
    }
    evidenceIds.forEach((id) => seen.add(id));
    return {
      workUnitId: stableWorkUnitId(input.itemId, evidenceIds),
      itemId: input.itemId,
      sourceExperienceId: target.sourceExperienceId,
      label,
      kind: unit.kind,
      evidenceIds,
    };
  });
  const omitted = [...allowed].filter((id) => !seen.has(id));
  if (omitted.length) {
    throw new Error(`item ${input.itemId} 仍有未分组 evidence：${omitted.join(",")}`);
  }
  return units;
}

function stableWorkUnitId(itemId: string, evidenceIds: readonly string[]) {
  const digest = sha256(stableStringify({ itemId, evidenceIds: [...evidenceIds].sort() }));
  return `work-unit-${digest.slice(0, 20)}`;
}
