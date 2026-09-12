export type RecruitingTakeoverReason =
  | "auth" | "otp" | "captcha" | "legal" | "sensitive"
  | "cross_origin_frame" | "uncertain_submit" | "unknown_field";
export interface RecruitingTakeoverContext {
  taskId: string;
  runId: string;
  tabId: string;
  origin: string;
  observationHash: string;
  grantHash: string;
}
export interface RecruitingTakeoverState {
  version: 1;
  status: "agent" | "takeover" | "invalidated";
  context: RecruitingTakeoverContext;
  reason: RecruitingTakeoverReason | null;
  enteredAt: string | null;
}
export interface RecruitingTakeoverFailure {
  code: "takeover_not_active" | "task_drift" | "run_drift" | "tab_drift"
    | "origin_drift" | "observation_stale" | "grant_drift";
  message: string;
}
export type RecruitingTakeoverResumeResult =
  | { ok: true; state: RecruitingTakeoverState }
  | { ok: false; state: RecruitingTakeoverState; failure: RecruitingTakeoverFailure };
export function createRecruitingTakeoverState(
  context: RecruitingTakeoverContext,
): RecruitingTakeoverState {
  return { version: 1, status: "agent", context: structuredClone(context), reason: null, enteredAt: null };
}
export function enterRecruitingTakeover(
  state: RecruitingTakeoverState,
  reason: RecruitingTakeoverReason,
): RecruitingTakeoverState {
  return { ...structuredClone(state), status: "takeover", reason, enteredAt: new Date().toISOString() };
}
export function resumeRecruitingTakeover(
  state: RecruitingTakeoverState,
  current: RecruitingTakeoverContext,
): RecruitingTakeoverResumeResult {
  const failure = identityFailure(state, current, true);
  if (failure) return invalidated(state, failure);
  if (!current.observationHash.trim()) {
    return invalidated(state, { code: "observation_stale", message: "恢复前必须重新观察当前页面" });
  }
  return { ok: true, state: { ...structuredClone(state), status: "agent", context: structuredClone(current), reason: null, enteredAt: null } };
}
/** Validates an old write/review token; any missing or changed hash is fatal. */
export function validateRecruitingTakeover(
  state: RecruitingTakeoverState,
  current: RecruitingTakeoverContext,
): RecruitingTakeoverFailure | null {
  const identity = identityFailure(state, current, false);
  if (identity) return identity;
  return !state.context.observationHash.trim() ||
      state.context.observationHash !== current.observationHash
    ? { code: "observation_stale", message: "页面观察已变化，请重新观察" }
    : null;
}
function identityFailure(
  state: RecruitingTakeoverState,
  current: RecruitingTakeoverContext,
  allowRunChange: boolean,
): RecruitingTakeoverFailure | null {
  if (state.status !== "takeover") return { code: "takeover_not_active", message: "当前没有等待用户接管的招聘页面任务" };
  const expected = state.context;
  if (expected.taskId !== current.taskId) return { code: "task_drift", message: "AgentTask 已变化，请重新观察" };
  if (!allowRunChange && expected.runId !== current.runId) return { code: "run_drift", message: "AgentRun 已变化，请重新观察" };
  if (expected.tabId !== current.tabId) return { code: "tab_drift", message: "浏览器标签页已变化，请重新观察" };
  if (expected.origin !== current.origin) return { code: "origin_drift", message: "页面网站已变化，请重新观察" };
  if (expected.grantHash !== current.grantHash) return { code: "grant_drift", message: "DelegationGrant 已变化，请重新授权" };
  return null;
}
function invalidated(
  state: RecruitingTakeoverState,
  failure: RecruitingTakeoverFailure,
): RecruitingTakeoverResumeResult {
  return { ok: false, state: { ...structuredClone(state), status: "invalidated" }, failure };
}
