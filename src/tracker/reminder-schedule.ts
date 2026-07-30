export type ReminderDueState = "future" | "due" | "missed";

export function reminderDueState(
  remindAt: string,
  now: Date,
  missedWindowMs = 24 * 60 * 60 * 1_000,
): ReminderDueState {
  const scheduled = Date.parse(remindAt);
  if (!Number.isFinite(scheduled)) throw new Error("提醒时间无效");
  const delay = now.getTime() - scheduled;
  if (delay < 0) return "future";
  return delay <= missedWindowMs ? "due" : "missed";
}

