import { resumeAgentNextAction } from "./agent-next-action.js";
import type { ResumeWorkspace } from "./types.js";

interface ResumeWriteParams {
  items?: readonly { itemId?: string }[];
  bulletUpdates?: readonly { bulletId: string }[];
  bulletRemovals?: readonly { bulletId: string }[];
  bulletAdditions?: readonly { itemId: string }[];
  tailGrowths?: readonly {
    bulletId: string;
    growthText: string;
  }[];
  lineRewrites?: readonly { bulletId: string }[];
}

export function resumeWriteRejection(
  workspace: ResumeWorkspace,
  params: ResumeWriteParams,
): string | undefined {
  const action = resumeAgentNextAction(workspace);
  if (action.mode === "request_more_material") {
    return "当前工作区正在等待用户补充素材；只能等待用户回答后调用 add_resume_material，或用扩大后的完整经历集合重新创建工作区";
  }
  if (action.mode === "await_augmented_confirmation") {
    return "nextAction 是 await_augmented_confirmation；停止工具循环并等待用户处理确认卡";
  }
  if (action.mode === "reduce_overflow") {
    return overflowReductionRejection(action, params);
  }
  if (action.mode === "repair_bullet_counts") {
    const hasOtherMode = Boolean(
      params.bulletUpdates?.length || params.bulletRemovals?.length ||
        params.bulletAdditions?.length || params.tailGrowths?.length ||
        params.lineRewrites?.length,
    );
    return params.items?.length && !hasOtherMode
      ? undefined
      : "nextAction 是 repair_bullet_counts；必须用一次 items 批量提交全部 itemTargets 的完整 bullet 列表";
  }
  if (action.mode === "repair_bullet_depth") {
    return completeLineRewriteBatchRejection(
      "repair_bullet_depth",
      action.bulletIds,
      params,
    );
  }
  if (action.mode === "increase_usage") {
    if (params.items?.length || params.bulletUpdates?.length ||
      params.bulletRemovals?.length ||
      params.tailGrowths?.length) {
      return `nextAction 是 increase_usage；本轮只允许 ${action.requiredInput}`;
    }
    if (action.requiredInput === "lineRewrites" &&
      params.bulletAdditions?.length) {
      return "nextAction 本轮 requiredInput=lineRewrites；不得同时或改用 bulletAdditions";
    }
    if (action.requiredInput === "bulletAdditions" &&
      params.lineRewrites?.length) {
      return "nextAction 本轮 requiredInput=bulletAdditions；不得改用 lineRewrites";
    }
    if (params.bulletAdditions?.length &&
      params.bulletAdditions.length > action.maximumAddedBullets) {
      return `bulletAdditions 最多新增 ${action.maximumAddedBullets} 条 bullet`;
    }
    if (params.lineRewrites?.length &&
      params.lineRewrites.length > action.targetExpandedBullets) {
      return `lineRewrites 最多改写 ${action.targetExpandedBullets} 条 bullet`;
    }
    const allowed = new Set(
      action.lineExpansionTargets.map((item) => item.bulletId),
    );
    const extra = params.lineRewrites?.filter(
      (item) => !allowed.has(item.bulletId),
    ).map((item) => item.bulletId) ?? [];
    if (extra.length) {
      return `lineRewrites 只能使用 lineExpansionTargets 中的 bullet：extra=${extra.join(",")}`;
    }
    return undefined;
  }
  if (action.mode === "batch_tail_reflow") {
    return completeLineRewriteBatchRejection(
      "batch_tail_reflow",
      action.bulletIds,
      params,
    );
  }
  if (action.mode !== "batch_tail_repair") {
    return params.tailGrowths?.length || params.lineRewrites?.length ||
        params.bulletRemovals?.length
      ? "tailGrowths 只允许用于 batch_tail_repair；lineRewrites 只允许用于 repair_bullet_depth、increase_usage 或 batch_tail_reflow；bulletRemovals 只允许用于 reduce_overflow"
      : undefined;
  }
  const supplied = new Set(params.tailGrowths?.map((item) => item.bulletId) ?? []);
  const required = new Set(action.bulletIds);
  const missing = action.bulletIds.filter((id) => !supplied.has(id));
  const extra = [...supplied].filter((id) => !required.has(id));
  if (!params.items?.length && !params.bulletUpdates?.length &&
    !params.bulletRemovals?.length && !params.bulletAdditions?.length &&
    !params.lineRewrites?.length &&
    params.tailGrowths?.length === action.bulletIds.length &&
    supplied.size === action.bulletIds.length && !missing.length &&
    !extra.length) {
    return undefined;
  }
  return [
    "nextAction 是 batch_tail_repair；必须用一次 tailGrowths 覆盖本批全部目标，每条只提交一个 growthText",
    `required=${action.bulletIds.join(",")}`,
    `missing=${missing.join(",") || "none"}`,
    `extra=${extra.join(",") || "none"}`,
  ].join("；");
}

function completeLineRewriteBatchRejection(
  mode: "repair_bullet_depth" | "batch_tail_reflow",
  requiredIds: readonly string[],
  params: ResumeWriteParams,
): string | undefined {
  const suppliedIds = params.lineRewrites?.map((item) => item.bulletId) ?? [];
  const supplied = new Set(suppliedIds);
  const required = new Set(requiredIds);
  const missing = requiredIds.filter((id) => !supplied.has(id));
  const extra = suppliedIds.filter((id) => !required.has(id));
  const hasOtherMode = Boolean(
    params.items?.length || params.bulletUpdates?.length ||
      params.bulletRemovals?.length || params.bulletAdditions?.length ||
      params.tailGrowths?.length,
  );
  const complete = params.lineRewrites?.length === requiredIds.length &&
    supplied.size === requiredIds.length && !missing.length && !extra.length;
  if (!hasOtherMode && complete) return undefined;
  return [
    `nextAction 是 ${mode}；必须用一次 lineRewrites 提交全部指定 bullet 的唯一完整改写`,
    `required=${requiredIds.join(",")}`,
    `missing=${missing.join(",") || "none"}`,
    `extra=${extra.map((id) => id || "missing_bulletId").join(",") || "none"}`,
  ].join("；");
}

function overflowReductionRejection(
  action: Extract<
    ReturnType<typeof resumeAgentNextAction>,
    { mode: "reduce_overflow" }
  >,
  params: ResumeWriteParams,
): string | undefined {
  if (action.requiredInput === "reselectWithoutOneExperience") {
    return "nextAction 是 reduce_overflow；当前已无高于最低条数的 bullet，只能用 create_resume_workspace 从当前完整非教育经历集合中移除一段最低相关经历";
  }
  if (params.items?.length || params.bulletUpdates?.length ||
    params.bulletAdditions?.length || params.tailGrowths?.length ||
    params.lineRewrites?.length) {
    return "nextAction 是 reduce_overflow；本轮只允许 bulletRemovals";
  }
  const removals = params.bulletRemovals ?? [];
  if (removals.length > action.maximumRemovedBullets) {
    return `reduce_overflow 本轮最多删除 ${action.maximumRemovedBullets} 条 bullet`;
  }
  const allowed = new Set(
    action.bulletRemovalTargets.map((target) => target.bulletId),
  );
  const extra = removals.filter((entry) => !allowed.has(entry.bulletId));
  if (extra.length) {
    return `bulletRemovals 只能删除 bulletRemovalTargets 中的额外 bullet：extra=${extra
      .map((entry) => entry.bulletId).join(",")}`;
  }
  return undefined;
}
