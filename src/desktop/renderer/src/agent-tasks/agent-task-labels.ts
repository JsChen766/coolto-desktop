import type { AgentTaskView } from "@desktop/types";

const STATUS_LABELS: Record<AgentTaskView["status"], string> = {
  draft: "草稿",
  awaiting_consent: "等待授权",
  queued: "待运行",
  running: "运行中",
  waiting: "等待中",
  paused: "已暂停",
  completed: "已完成",
  partially_completed: "部分完成",
  failed: "失败",
  canceled: "已取消",
  expired: "已过期",
};

const WAITING_LABELS: Record<string, string> = {
  timer: "等待本机时间",
  external_event: "等待外部事件",
  approval: "等待审批",
  takeover: "等待用户接管",
  answer: "等待用户回答",
};
const ACTION_STATUS_LABELS: Record<string, string> = {
  succeeded: "成功", partial: "部分成功", blocked: "已阻止",
  uncertain: "结果待核验", failed: "失败",
  allow: "允许", block: "阻止", ask: "需要确认",
};

export function taskStatusLabel(status: AgentTaskView["status"]): string {
  return STATUS_LABELS[status];
}

export function waitingReasonLabel(reason: string): string {
  return WAITING_LABELS[reason] ?? reason;
}

export function actionStatusLabel(status: string): string {
  return ACTION_STATUS_LABELS[status] ?? status;
}
