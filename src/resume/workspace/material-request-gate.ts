import { bulletCountRepairPlan } from "./bullet-count-repair.js";
import { RESUME_LAYOUT_TOLERANCE_PX } from "../compiler-types.js";
import {
  isStandaloneScalarEvidence,
  writableEvidenceCandidates,
} from "../quality/evidence-candidates.js";
import { createResumeMaterialRequest } from "./material-request.js";
import { minimumResumeBulletCount } from "./bullet-count-rules.js";
import type { ResumeWorkspace } from "./types.js";

export function applyBulletCountMaterialGate(
  workspace: ResumeWorkspace,
): ResumeWorkspace {
  if (
    workspace.status === "needs_user_decision" &&
    workspace.materialRequest?.kind !== "bullet_count_insufficient"
  ) return workspace;
  if (
    workspace.compileResult.pageCount !== 1 ||
    workspace.compileResult.overflowPx > RESUME_LAYOUT_TOLERANCE_PX
  ) return clearBulletCountRequest(workspace);

  const plan = bulletCountRepairPlan(workspace);
  if (plan.mode === "request_more_material") {
    return {
      ...workspace,
      status: "needs_user_decision",
      materialRequest: createResumeMaterialRequest(workspace, {
        kind: "bullet_count_insufficient",
        reason: "所选经历的独立事实数量不足以满足当前经历层级的最低 bullet 数",
        question: plan.question,
        targetExperienceId: plan.targetExperienceId,
      }),
    };
  }
  if (workspace.materialRequest?.kind !== "bullet_count_insufficient") {
    return workspace;
  }
  return clearBulletCountRequest(workspace);
}

function clearBulletCountRequest(workspace: ResumeWorkspace): ResumeWorkspace {
  if (workspace.materialRequest?.kind !== "bullet_count_insufficient") {
    return workspace;
  }
  const resumed = { ...workspace, status: "writing" as const };
  delete resumed.materialRequest;
  return resumed;
}

/** Stops an empty workspace when even every independent fact at three lines cannot fill it. */
export function applyInitialMaterialFeasibilityGate(
  workspace: ResumeWorkspace,
): ResumeWorkspace {
  if (hasWrittenContent(workspace)) return workspace;
  if (
    workspace.status === "needs_user_decision" &&
    workspace.materialRequest?.kind !== "layout_capacity_insufficient"
  ) return workspace;
  if (
    workspace.compileResult.pageCount !== 1 ||
    workspace.compileResult.overflowPx > RESUME_LAYOUT_TOLERANCE_PX
  ) return clearLayoutCapacityRequest(workspace);

  const writableIds = writableExperienceIds(workspace);
  const sourceFacts = writableEvidenceCandidates(workspace.sourceSnapshot)
    .filter((entry) => writableIds.has(entry.experienceId));
  const supplementalFacts = (workspace.supplementalEvidence ?? []).filter(
    (entry) =>
      writableIds.has(entry.experienceId) &&
      !isStandaloneScalarEvidence(entry.text),
  );
  const factCount = sourceFacts.length + supplementalFacts.length;
  const lineHeight = Math.max(1, workspace.compileResult.bodyLineHeightPx);
  const minimumLinesToAdd = Math.ceil(Math.max(
    0,
    workspace.compileResult.availableHeightPx *
      workspace.compileResult.effectiveTargetBand.minimum -
      workspace.compileResult.usedHeightPx - RESUME_LAYOUT_TOLERANCE_PX,
  ) / lineHeight);
  const maximumSupportedLines = factCount * (workspace.maxBulletLines ?? 3);
  if (maximumSupportedLines >= minimumLinesToAdd) {
    return clearLayoutCapacityRequest(workspace);
  }

  const target = materialTarget(workspace, sourceFacts, supplementalFacts);
  const missingFacts = Math.max(1, Math.ceil(
    (minimumLinesToAdd - maximumSupportedLines) /
      (workspace.maxBulletLines ?? 3),
  ));
  const subject = target
    ? `经历「${target.label}」`
    : "与目标岗位直接相关的经历";
  return {
    ...workspace,
    status: "needs_user_decision",
    materialRequest: createResumeMaterialRequest(workspace, {
      kind: "layout_capacity_insufficient",
      reason: "现有独立事实即使全部写到单条最大行数也无法达到页面交付门槛",
      question: `${subject}的现有事实不足以完成一页合格简历。请再补充至少 ${missingFacts} 条不同的真实事实，优先说明具体任务、方法、协作范围、规模或结果。`,
      ...(target ? { targetExperienceId: target.experienceId } : {}),
    }),
  };
}

function hasWrittenContent(workspace: ResumeWorkspace): boolean {
  return workspace.structure.sections.some((section) =>
    section.items.some((item) => item.bullets.length > 0)
  );
}

function writableExperienceIds(workspace: ResumeWorkspace): Set<string> {
  return new Set(workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => {
      const tier = workspace.itemTiers?.[item.id];
      const minimum = minimumResumeBulletCount({
        sectionType: section.type,
        itemId: item.id,
        ...(tier ? { tier } : {}),
      });
      return minimum > 0 && item.source_experience_id
        ? [item.source_experience_id]
        : [];
    })
  ));
}

function materialTarget(
  workspace: ResumeWorkspace,
  sourceFacts: Array<{ experienceId: string }>,
  supplementalFacts: Array<{ experienceId: string }>,
): { experienceId: string; label: string } | undefined {
  const counts = new Map<string, number>();
  for (const fact of [...sourceFacts, ...supplementalFacts]) {
    counts.set(fact.experienceId, (counts.get(fact.experienceId) ?? 0) + 1);
  }
  return workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => {
      const tier = workspace.itemTiers?.[item.id];
      return item.source_experience_id && (tier === "main" || tier === "secondary")
        ? [{
            experienceId: item.source_experience_id,
            label: item.organization || item.title || item.source_experience_id,
            tier,
            count: counts.get(item.source_experience_id) ?? 0,
          }]
        : [];
    })
  ).sort((left, right) =>
    Number(left.tier !== "main") - Number(right.tier !== "main") ||
    left.count - right.count
  )[0];
}

function clearLayoutCapacityRequest(
  workspace: ResumeWorkspace,
): ResumeWorkspace {
  if (workspace.materialRequest?.kind !== "layout_capacity_insufficient") {
    return workspace;
  }
  const resumed = { ...workspace, status: "writing" as const };
  delete resumed.materialRequest;
  return resumed;
}
