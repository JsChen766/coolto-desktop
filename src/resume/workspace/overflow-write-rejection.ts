import type { resumeAgentNextAction } from "./agent-next-action.js";
import type { ResumeWriteParams } from "./agent-write-rejection.js";

export function overflowReductionRejection(
  action: Extract<
    ReturnType<typeof resumeAgentNextAction>,
    { mode: "reduce_overflow" }
  >,
  params: ResumeWriteParams,
): string | undefined {
  if (action.requiredInput === "reselectWithoutOneExperience") {
    return "nextAction 是 reduce_overflow；当前已无高于最低条数的 bullet，只能用 create_resume_workspace 从当前完整非教育经历集合中移除一段最低相关经历";
  }
  if (params.workUnits?.length || params.items?.length ||
    params.bulletUpdates?.length || params.bulletAdditions?.length ||
    params.tailGrowths?.length || params.lineExpansions?.length ||
    params.lineRewrites?.length || params.tailRewrites?.length) {
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
