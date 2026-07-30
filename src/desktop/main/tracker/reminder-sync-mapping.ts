import type { Reminder, ReminderInput } from "../../../tracker/child-types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import { childBase, dateString, enumValue, nullableDate, nullableString } from "./tracker-mapping-utils.js";

const STATUSES = ["scheduled", "delivered", "dismissed", "canceled"] as const;

export function toReminder(entity: LocalEntity): Reminder {
  return {
    ...childBase(entity),
    interviewRoundId: nullableString(entity.payload.interviewRoundId, "reminder.interviewRoundId"),
    title: typeof entity.payload.title === "string" && entity.payload.title.trim()
      ? entity.payload.title : malformed("reminder.title"),
    remindAt: dateString(entity.payload.remindAt, "reminder.remindAt"),
    status: enumValue(entity.payload.status, STATUSES, "reminder.status"),
    deliveredAt: nullableDate(entity.payload.deliveredAt, "reminder.deliveredAt"),
  };
}

export function reminderWritePayload(applicationId: string, input: ReminderInput) {
  const title = input.title.trim();
  if (!title || [...title].length > 240) throw new Error("提醒标题应为 1–240 字");
  if (!Number.isFinite(Date.parse(input.remindAt))) throw new Error("提醒时间无效");
  if (!STATUSES.includes(input.status)) throw new Error("提醒状态无效");
  if (input.deliveredAt && !Number.isFinite(Date.parse(input.deliveredAt))) {
    throw new Error("提醒送达时间无效");
  }
  return {
    applicationId, interviewRoundId: input.interviewRoundId?.trim() || null,
    title, remindAt: input.remindAt, status: input.status,
    deliveredAt: input.deliveredAt ?? null,
  };
}

export function localReminder(
  id: string, applicationId: string, input: ReminderInput, now: string,
  previous?: Reminder,
): Record<string, unknown> {
  return {
    id, ...reminderWritePayload(applicationId, input), entityVersion: previous?.entityVersion ?? 1,
    createdAt: previous?.createdAt ?? now, updatedAt: now,
  };
}

function malformed(label: string): never {
  throw new Error(`Malformed ${label}`);
}
