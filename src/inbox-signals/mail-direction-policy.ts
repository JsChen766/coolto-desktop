import type { JsonValue } from "../agent-task/json-types.js";
import type { MailDirection } from "./inbox-signal-types.js";

export function assertMailDirectionAllowed(
  policy: Record<string, JsonValue> | undefined,
  direction: MailDirection,
): void {
  const configured = policy?.riskMailDirections ?? policy?.scheduleMailDirections;
  if (!Array.isArray(configured)) return;
  const directions = configured.filter(
    (value): value is MailDirection => value === "received" || value === "sent",
  );
  if (!directions.includes(direction)) {
    throw new Error(`邮件方向 ${direction} 不在当前 DelegationGrant 范围`);
  }
}

export function nextMailPollAt(
  policy: Record<string, JsonValue> | undefined,
  now = Date.now(),
): string {
  const configured = policy?.pollIntervalMinutes;
  const minutes = typeof configured === "number" && Number.isInteger(configured) &&
    configured >= 5 && configured <= 1440 ? configured : 15;
  return new Date(now + minutes * 60_000).toISOString();
}

export function requireSelectedMailConnection(
  policy: Record<string, JsonValue> | undefined,
  connectionId: string,
): void {
  const values = policy?.mailConnectionIds;
  if (!Array.isArray(values) || !values.includes(connectionId)) {
    throw new Error("该邮箱连接未包含在当前 DelegationGrant");
  }
}
