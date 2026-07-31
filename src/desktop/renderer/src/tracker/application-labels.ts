import type { ApplicationRecord, ApplicationStatus } from "@desktop/types";
import { localeCode, localizedRecord, translate } from "../i18n/locale";

export const STATUS_LABELS = localizedRecord<ApplicationStatus>({
  applied: "已投递",
  screening: "筛选沟通",
  interviewing: "面试",
  offer: "Offer",
  rejected: "已拒绝",
  no_response: "无回应",
});

export function transitionLabel(
  current: ApplicationStatus,
  target: ApplicationStatus,
): string {
  return current === "interviewing" && target === "interviewing"
    ? translate("记录下一轮面试")
    : localeCode() === "zh-CN"
      ? `转为${STATUS_LABELS[target]}`
      : `Move to ${STATUS_LABELS[target]}`;
}

export function syncLabel(value: ApplicationRecord["syncStatus"]): string {
  if (value === "pending") return translate("等待同步");
  if (value === "conflict") return translate("同步冲突");
  return translate("已同步");
}

export function deliveryLabel(value: ApplicationRecord["deliveryMethod"]): string {
  return translate({
    form_fill: "网页表单",
    email_fill: "邮件投递",
    manual: "手动记录",
    other: "其他方式",
  }[value]);
}
