export function followUpAutoStartAfter(
  checkIntervalHours: number,
  now = Date.now(),
): string {
  return new Date(now + checkIntervalHours * 3_600_000).toISOString();
}

export function briefingAutoStartAfter(
  scheduledAt: string | null | undefined,
  wakeBeforeMinutes: number,
  now = Date.now(),
): string {
  const interviewTime = scheduledAt ? Date.parse(scheduledAt) : Number.NaN;
  if (!Number.isFinite(interviewTime)) {
    throw new Error("scheduled Interview 缺少有效时间");
  }
  return new Date(Math.max(now, interviewTime - wakeBeforeMinutes * 60_000)).toISOString();
}

export function normalizedAutoStartAfter(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Loop autoStartAfter 无效");
  return new Date(timestamp).toISOString();
}
