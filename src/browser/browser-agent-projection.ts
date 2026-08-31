import type { BrowserAgentActionKind, BrowserAgentActivityCode, BrowserAgentChromeView,
  BrowserAgentPhase, BrowserAgentProjectionFacts } from
  "../desktop/shared/types/browser-agent.js";
import { deriveBrowserAgentCommands } from "./browser-agent-command-policy.js";
const CAPABILITIES = ["read", "control", "write", "download", "submit"] as const;
export function projectBrowserAgentChrome(
  facts: BrowserAgentProjectionFacts | null,
  now = Date.now(),
): BrowserAgentChromeView | null {
  if (!facts) return null;
  const delegation = projectDelegation(facts.delegation, now);
  const review = facts.review ? boundedReview(facts.review) : null;
  const phase = derivePhase(facts, delegation?.state ?? null, Boolean(review));
  const currentAction = facts.currentAction ? {
    kind: knownActionKind(facts.currentAction.kind),
    label: actionLabel(facts.currentAction.kind),
    impact: facts.currentAction.impact,
    targetOrigin: safeOrigin(facts.currentAction.targetOrigin),
    startedAt: safeTime(facts.currentAction.startedAt, facts.task.updatedAt),
  } : null;
  const targetTabId = safeTabId(facts.currentAction?.targetTabId ??
    facts.pageAccess?.targetTabId ?? null);
  const requiredUserAction = deriveRequiredAction(facts, phase, delegation?.state ?? null);
  const commandPending = Boolean(facts.commandPending);
  return {
    goal: safeText(facts.task.goal, 4_000, "Agent 任务"),
    phase,
    control: facts.control === "user" ? "user" : "agent",
    summary: phaseSummary(phase, facts, currentAction?.label ?? null),
    currentAction,
    targetTabId,
    targetOrigin: currentAction?.targetOrigin ?? safeOrigin(facts.pageAccess?.origin),
    delegation,
    pageAccess: facts.pageAccess ? {
      mode: facts.pageAccess.mode,
      origin: safeOrigin(facts.pageAccess.origin),
    } : null,
    review,
    requiredUserAction,
    recentActivity: projectActivity(facts.activity),
    commands: deriveBrowserAgentCommands(
      facts, delegation?.state ?? null, commandPending,
    ),
    commandError: facts.commandError ? "任务操作失败，请重试" : null,
    commandPending,
    updatedAt: safeTime(facts.task.updatedAt, new Date(now).toISOString()),
  };
}
function derivePhase(
  facts: BrowserAgentProjectionFacts,
  grant: "active" | "expired" | "revoked" | null,
  reviewing: boolean,
): BrowserAgentPhase {
  const status = facts.task.status;
  if (status === "completed") return "completed";
  if (status === "partially_completed") return "partial";
  if (status === "failed") return "failed";
  if (status === "canceled") return "stopped";
  if (status === "expired") return "expired";
  if (reviewing) return "reviewing";
  if (facts.control === "user") return "user_control";
  if (grant === "revoked") return "revoked";
  if (grant === "expired") return "expired";
  if (status === "running") return facts.currentAction ? "acting" : "planning";
  if (status === "waiting") return "waiting";
  if (status === "paused") return "paused";
  return "queued";
}
function projectDelegation(
  value: BrowserAgentProjectionFacts["delegation"],
  now: number,
): BrowserAgentChromeView["delegation"] {
  if (!value) return null;
  const domains = [...new Set(value.domains.map(safeDomain).filter(Boolean))] as string[];
  const capabilities = CAPABILITIES.filter((item) => value.capabilities.includes(item));
  const expiry = Date.parse(value.expiresAt);
  const state = value.revokedAt ? "revoked"
    : !Number.isFinite(expiry) || expiry <= now ? "expired" : "active";
  return {
    state,
    domains: domains.slice(0, 3),
    moreDomainCount: Math.max(0, domains.length - 3),
    capabilities,
    unattended: Boolean(value.unattended),
    expiresAt: safeTime(value.expiresAt, ""),
  };
}
function projectActivity(values: BrowserAgentProjectionFacts["activity"]):
BrowserAgentChromeView["recentActivity"] {
  return [...values].sort((a, b) => timeValue(b.occurredAt) - timeValue(a.occurredAt))
    .slice(0, 3).map((item) => ({
      kind: item.kind,
      label: activityLabel(item.code),
      tone: activityTone(item.code),
      origin: safeOrigin(item.origin),
      occurredAt: safeTime(item.occurredAt, ""),
    }));
}
function deriveRequiredAction(
  facts: BrowserAgentProjectionFacts,
  phase: BrowserAgentPhase,
  grant: "active" | "expired" | "revoked" | null,
): BrowserAgentChromeView["requiredUserAction"] {
  if (phase === "reviewing") return { kind: "review",
    count: boundedReview(facts.review ?? { total: 0, decided: 0 }).pending,
    label: "审核页面修改" };
  if (phase === "user_control") return { kind: "return_control", count: null,
    label: "交还 Agent" };
  if (facts.task.waitingReason === "approval") return { kind: "approval", count: null,
    label: "完成待确认操作" };
  if (facts.task.waitingReason === "answer") return { kind: "answer", count: null,
    label: "回答 Agent" };
  if (facts.task.waitingReason === "takeover") return { kind: "return_control", count: null,
    label: "交还 Agent" };
  if (phase === "paused" && grant === "active") return { kind: "resume", count: null,
    label: "继续任务" };
  return null;
}
function phaseSummary(
  phase: BrowserAgentPhase,
  facts: BrowserAgentProjectionFacts,
  action: string | null,
): string {
  if (phase === "acting") return action ?? "Agent 正在执行一项操作";
  if (phase === "planning") return facts.modelActive
    ? "Agent 正在判断下一步" : "Agent 正在处理任务";
  if (phase === "reviewing") return "等待你审核页面修改";
  if (phase === "user_control") return "你正在操作，Agent 已停止页面动作";
  if (phase === "waiting") return waitingSummary(facts.task.waitingReason);
  return ({
    queued: "任务等待启动", paused: "Agent 已暂停", revoked: "任务授权已撤销",
    expired: "任务或授权已过期", completed: "任务已完成", partial: "任务已部分完成",
    failed: "任务执行失败", stopped: "任务已停止",
  } as Partial<Record<BrowserAgentPhase, string>>)[phase] ?? "Agent 任务";
}
function waitingSummary(reason: BrowserAgentProjectionFacts["task"]["waitingReason"]): string {
  if (reason === "approval") return "等待你确认";
  if (reason === "answer") return "等待你回答";
  if (reason === "takeover") return "等待你交还控制";
  return "等待外部条件";
}
function actionLabel(kind: BrowserAgentActionKind): string {
  return ({ observe: "读取页面信息", navigate: "打开或切换页面", tab: "管理浏览器标签",
    fill: "填写页面内容", review: "启动页面审核", download: "下载文件",
    submit: "提交申请", other: "Agent 正在执行一项操作" } as const)[knownActionKind(kind)];
}
function activityLabel(code: BrowserAgentActivityCode): string {
  if (code === "takeover") return "你已接管页面操作";
  if (code === "return_control") return "页面操作已交还 Agent";
  if (code === "policy_blocked") return "一项操作已被安全策略阻止";
  if (code === "policy_requires_user") return "一项操作需要你确认";
  if (code === "action_succeeded") return "页面操作已完成";
  if (code === "action_partial") return "页面操作部分完成";
  if (code === "action_blocked") return "页面操作已被阻止";
  if (code === "action_uncertain") return "页面操作结果待确认";
  if (code === "action_failed") return "页面操作失败";
  return "任务收到新事件";
}
function activityTone(code: BrowserAgentActivityCode): "neutral" | "success" | "warning" | "danger" {
  if (code === "action_succeeded" || code === "return_control") return "success";
  if (code === "action_failed") return "danger";
  if (["policy_blocked", "policy_requires_user", "action_partial", "action_blocked",
    "action_uncertain"].includes(code)) return "warning";
  return "neutral";
}
function knownActionKind(value: unknown): BrowserAgentActionKind {
  return ["observe", "navigate", "tab", "fill", "review", "download", "submit"]
    .includes(String(value)) ? value as BrowserAgentActionKind : "other";
}
function boundedReview(value: { total: number; decided: number }):
{ total: number; decided: number; pending: number } {
  const total = boundedInteger(value.total);
  const decided = Math.min(total, boundedInteger(value.decided));
  return { total, decided, pending: total - decided };
}
function safeOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch { return null; }
}
function safeDomain(value: unknown): string {
  if (typeof value !== "string") return "";
  const domain = value.trim().toLowerCase();
  return domain.length <= 253 && /^[a-z0-9.-]+$/u.test(domain) ? domain : "";
}
function safeTabId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 200 &&
    !/[\u0000-\u001f\u007f]/u.test(value) ? value : null;
}
function safeText(value: unknown, max: number, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const text = value.trim().replace(/[\u0000-\u001f\u007f]/gu, " ");
  return text ? text.slice(0, max) : fallback;
}
function safeTime(value: unknown, fallback: string): string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : fallback;
}
function timeValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function boundedInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(10_000, Math.trunc(value))) : 0;
}
