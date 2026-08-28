import { resumeAgentNextAction } from "./agent-next-action.js";
import type { ResumeWorkspace } from "./types.js";
import { factNeutralClosureActive } from "./first-generation-policy.js";

interface ResumeWriteParams {
  items?: readonly { itemId?: string }[];
  bulletUpdates?: readonly { bulletId: string }[];
  bulletRemovals?: readonly { bulletId: string }[];
  bulletAdditions?: readonly { itemId: string; evidenceIds?: readonly string[] }[];
  tailGrowths?: readonly {
    bulletId: string;
    growthText?: string;
    contentMode?: "fact_neutral";
  }[];
  lineExpansions?: readonly {
    bulletId: string;
    component?: "context" | "method" | "action" | "result";
    placement?: "prepend" | "after" | "append";
    anchor?: string;
    insertText?: string;
    contentMode?: "fact_neutral";
  }[];
  lineRewrites?: readonly {
    bulletId: string;
    contentMode?: "fact_neutral";
  }[];
  tailRewrites?: readonly {
    bulletId: string;
    candidates?: readonly {
      strategy?: "compact" | "expand";
      revisedText?: string;
      additionalEvidenceIds?: readonly string[];
      contentMode?: "fact_neutral";
    }[];
  }[];
}

export function resumeWriteRejection(
  workspace: ResumeWorkspace,
  params: ResumeWriteParams,
): string | undefined {
  const action = resumeAgentNextAction(workspace);
  const neutralModeError = factNeutralModeError(workspace, params);
  if (neutralModeError) return neutralModeError;
  if (action.mode === "adapt_reused_content") {
    const supplied = new Set(params.items?.flatMap((item) =>
      item.itemId ? [item.itemId] : []
    ) ?? []);
    const hasOtherMode = Boolean(
      params.bulletUpdates?.length || params.bulletRemovals?.length ||
        params.bulletAdditions?.length || params.tailGrowths?.length ||
        params.lineExpansions?.length || params.lineRewrites?.length ||
        params.tailRewrites?.length,
    );
    const missing = action.itemIds.filter((itemId) => !supplied.has(itemId));
    const extra = [...supplied].filter((itemId) =>
      !action.itemIds.includes(itemId)
    );
    return params.items?.length === action.itemIds.length && !hasOtherMode &&
        !missing.length && !extra.length
      ? undefined
      : `nextAction 是 adapt_reused_content；必须用一次 items 完整覆盖 itemTargets；missing=${missing.join(",") || "none"}；extra=${extra.join(",") || "none"}`;
  }
  if (action.mode === "request_more_material") {
    return "当前工作区正在等待用户回应补充邀约；补充事实时调用 add_resume_material，不需要补充或没有更多事实时调用 confirm_no_resume_material 进入最终收尾，只有用户明确停止整份生成时才保留未达标草稿";
  }
  if (action.mode === "assess_evidence") {
    return `nextAction 是 assess_evidence 第 ${action.round} 轮；必须先调用 assess_resume_evidence 完整覆盖当前 evidenceIds`;
  }
  if (action.mode === "await_augmented_confirmation") {
    return "nextAction 是 await_augmented_confirmation；停止工具循环并等待用户处理确认卡";
  }
  if (action.mode === "integrate_supplemental_evidence") {
    const supplied = new Set(params.items?.flatMap((item) =>
      item.itemId ? [item.itemId] : []
    ) ?? []);
    const hasOtherMode = Boolean(
      params.bulletUpdates?.length || params.bulletRemovals?.length ||
        params.bulletAdditions?.length || params.tailGrowths?.length ||
        params.lineExpansions?.length || params.lineRewrites?.length ||
        params.tailRewrites?.length,
    );
    const missing = action.itemIds.filter((itemId) => !supplied.has(itemId));
    return params.items?.length === action.itemIds.length && !hasOtherMode &&
        !missing.length
      ? undefined
      : `nextAction 是 integrate_supplemental_evidence；必须用一次 items 完整覆盖 itemTargets；missing=${missing.join(",") || "none"}`;
  }
  if (action.mode === "reduce_overflow") {
    return overflowReductionRejection(action, params);
  }
  if (action.mode === "repair_bullet_counts") {
    const hasOtherMode = Boolean(
      params.bulletUpdates?.length || params.bulletRemovals?.length ||
        params.bulletAdditions?.length || params.tailGrowths?.length ||
        params.lineExpansions?.length || params.lineRewrites?.length ||
        params.tailRewrites?.length,
    );
    return params.items?.length && !hasOtherMode
      ? undefined
      : "nextAction 是 repair_bullet_counts；必须用一次 items 批量提交全部 itemTargets 的完整 bullet 列表";
  }
  if (action.mode === "increase_usage") {
    if (params.items?.length || params.bulletUpdates?.length ||
      params.bulletRemovals?.length ||
      params.tailGrowths?.length || params.tailRewrites?.length) {
      return `nextAction 是 increase_usage；本轮只允许 ${action.requiredInput}`;
    }
    if (action.requiredInput === "lineExpansions" &&
      params.bulletAdditions?.length) {
      return "nextAction 本轮 requiredInput=lineExpansions；不得同时或改用 bulletAdditions";
    }
    if (action.requiredInput === "bulletAdditions" &&
      (params.lineExpansions?.length || params.lineRewrites?.length)) {
      return "nextAction 本轮 requiredInput=bulletAdditions；不得改用 lineExpansions";
    }
    if (params.bulletAdditions?.length &&
      params.bulletAdditions.length > action.maximumAddedBullets) {
      return `bulletAdditions 最多新增 ${action.maximumAddedBullets} 条 bullet`;
    }
    const allowedEvidence = new Set(
      action.groundedAdditionTargets.map((target) => target.evidenceId),
    );
    const extraEvidence = (params.bulletAdditions ?? []).flatMap(
      (addition) => addition.evidenceIds ?? [],
    ).filter((evidenceId) => !allowedEvidence.has(evidenceId));
    if (extraEvidence.length) {
      return `bulletAdditions 只能使用 groundedAdditionTargets：extra=${extraEvidence.join(",")}`;
    }
    const expansions = params.lineExpansions ?? params.lineRewrites;
    if (expansions?.length &&
      expansions.length > action.targetExpandedBullets) {
      return `lineExpansions 最多扩写 ${action.targetExpandedBullets} 条 bullet`;
    }
    const allowed = new Set(
      action.lineExpansionTargets.map((item) => item.bulletId),
    );
    const extra = expansions?.filter(
      (item) => !allowed.has(item.bulletId),
    ).map((item) => item.bulletId) ?? [];
    if (extra.length) {
      return `lineExpansions 只能使用 lineExpansionTargets 中的 bullet：extra=${extra.join(",")}`;
    }
    return undefined;
  }
  if (action.mode !== "batch_tail_rewrite") {
    return params.tailGrowths?.length || params.lineExpansions?.length ||
        params.lineRewrites?.length || params.tailRewrites?.length ||
        params.bulletRemovals?.length
      ? "tailRewrites 只允许用于 batch_tail_rewrite；lineRewrites 仅用于 page fill；bulletRemovals 只允许用于 reduce_overflow"
      : undefined;
  }
  const inputs = params.tailRewrites;
  const supplied = new Set(
    inputs?.map((item) => item.bulletId) ?? [],
  );
  const required = new Set(action.bulletIds);
  const missing = action.bulletIds.filter((id) => !supplied.has(id));
  const extra = [...supplied].filter((id) => !required.has(id));
  if (!params.items?.length && !params.bulletUpdates?.length &&
    !params.bulletRemovals?.length && !params.bulletAdditions?.length &&
    !params.lineExpansions?.length && !params.lineRewrites?.length &&
    !params.tailGrowths?.length &&
    inputs?.length === action.bulletIds.length &&
    supplied.size === action.bulletIds.length && !missing.length &&
    !extra.length) {
    return undefined;
  }
  return [
    `nextAction 是 ${action.mode}；必须用一次 ${action.requiredInput} 覆盖本批全部目标，每条提交 1–2 份完整事实等价改写`,
    `required=${action.bulletIds.join(",")}`,
    `missing=${missing.join(",") || "none"}`,
    `extra=${extra.join(",") || "none"}`,
  ].join("；");
}

function factNeutralModeError(
  workspace: ResumeWorkspace,
  params: ResumeWriteParams,
): string | undefined {
  const neutralInputs = [
    ...(params.tailGrowths ?? []),
    ...(params.lineExpansions ?? []),
    ...(params.lineRewrites ?? []),
  ];
  const tailCandidates = (params.tailRewrites ?? []).flatMap(
    (input) => input.candidates ?? [],
  );
  const factNeutralRequested = [
    ...neutralInputs,
    ...tailCandidates,
  ].some((input) => input.contentMode === "fact_neutral");
  const neutralActive = factNeutralClosureActive(workspace);
  if (factNeutralRequested && !neutralActive) {
    return workspace.factNeutralAuthorization
      ? "首次生成仍有可写的真实证据或最低 bullet 数缺口；必须先完成 grounded 写入，不能提前使用 fact_neutral"
      : "用户尚未明确结束补充并进入最终收尾，不能使用 fact_neutral";
  }
  if (!neutralActive) return undefined;
  if (neutralInputs.length && neutralInputs.some(
    (input) => input.contentMode !== "fact_neutral"
  )) {
    return "当前已进入无素材充实阶段；所有篇幅改写必须显式传 contentMode=fact_neutral";
  }
  if (tailCandidates.length && tailCandidates.some(
    (input) => input.contentMode !== "fact_neutral"
  )) {
    return "当前已进入无素材充实阶段；所有尾行候选必须显式传 contentMode=fact_neutral";
  }
  return undefined;
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
    params.lineExpansions?.length || params.lineRewrites?.length ||
    params.tailRewrites?.length) {
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
