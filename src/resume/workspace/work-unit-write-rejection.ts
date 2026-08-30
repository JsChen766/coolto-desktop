import type { resumeAgentNextAction } from "./agent-next-action.js";

type Action = ReturnType<typeof resumeAgentNextAction>;

export function workUnitGroupingWriteRejection(
  action: Action,
  params: {
    workUnits?: readonly unknown[];
    items?: readonly unknown[];
    bulletUpdates?: readonly unknown[];
    bulletRemovals?: readonly unknown[];
    bulletAdditions?: readonly unknown[];
    tailGrowths?: readonly unknown[];
    lineExpansions?: readonly unknown[];
    lineRewrites?: readonly unknown[];
    tailRewrites?: readonly unknown[];
  },
): string | undefined | null {
  if (action.mode !== "group_work_units") return null;
  const hasOtherMode = Boolean(
    params.items?.length || params.bulletUpdates?.length ||
      params.bulletRemovals?.length || params.bulletAdditions?.length ||
      params.tailGrowths?.length || params.lineExpansions?.length ||
      params.lineRewrites?.length || params.tailRewrites?.length,
  );
  return params.workUnits?.length && !hasOtherMode
    ? undefined
    : "nextAction 是 group_work_units；必须用一次 workUnits 完整覆盖全部 itemTargets";
}

export function additionWorkUnitRejection(
  action: Extract<Action, { mode: "increase_usage" }>,
  additions: readonly { workUnitIds?: readonly string[] }[],
): string | undefined {
  const allowed = new Set(action.groundedAdditionTargets.flatMap((target) =>
    target.workUnitId ? [target.workUnitId] : []
  ));
  const extra = additions.flatMap((addition) => addition.workUnitIds ?? [])
    .filter((id) => !allowed.has(id));
  return extra.length
    ? `bulletAdditions 只能使用 groundedAdditionTargets 中的 WorkUnit：extra=${extra.join(",")}`
    : undefined;
}
