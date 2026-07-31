import type {
  InterviewStatus,
  InterviewType,
  NoteType,
  ReminderStatus,
  TrackerChildKind,
  TrackerMutationKind,
} from "@desktop/types";
import { localizedRecord, translate } from "../i18n/locale";

export const INTERVIEW_TYPE_LABELS = localizedRecord<InterviewType>({
  phone: "电话面试", video: "视频面试", onsite: "现场面试", hr: "HR 面试",
  technical: "技术面试", case: "案例面试", other: "其他",
});
export const INTERVIEW_STATUS_LABELS = localizedRecord<InterviewStatus>({
  scheduled: "已安排", completed: "已完成", canceled: "已取消",
});
export const NOTE_TYPE_LABELS = localizedRecord<NoteType>({
  general: "普通记录", interview: "面试记录", follow_up: "跟进记录", company: "公司信息",
});
export const REMINDER_STATUS_LABELS = localizedRecord<ReminderStatus>({
  scheduled: "待提醒", delivered: "已送达", dismissed: "已忽略", canceled: "已取消",
});

export const CHILD_LABELS = localizedRecord<TrackerChildKind>({
  interview: "面试", note: "笔记", reminder: "提醒",
});
export const MUTATION_LABELS = localizedRecord<TrackerMutationKind>({
  create: "新增", update: "修改", delete: "删除",
});

export function localDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function isoFromLocal(value: string): string | null {
  if (!value) return null;
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) throw new Error(translate("日期时间无效"));
  return time.toISOString();
}
