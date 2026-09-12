import { numberSelectOptions } from "../components/dialog-select-options";
import type { DialogSelectOption } from "../components/dialog-select-types";
import { translate, translateFormat } from "../i18n/locale";

export const jobProviderOptions: DialogSelectOption[] = [
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
];

export function loopExpiry7And30Options(): DialogSelectOption[] {
  return numberSelectOptions([
    { value: 7, label: "7 天" },
    { value: 30, label: "30 天" },
  ]);
}

export function loopExpiry30And90Options(): DialogSelectOption[] {
  return numberSelectOptions([
    { value: 30, label: "30 天" },
    { value: 90, label: "90 天" },
  ]);
}

export function loopExpiry1_7_30Options(): DialogSelectOption[] {
  return numberSelectOptions([
    { value: 1, label: translate("1 天") },
    { value: 7, label: translate("7 天") },
    { value: 30, label: translate("30 天") },
  ]);
}

export function loopReviewIntervalDayOptions(): DialogSelectOption[] {
  return numberSelectOptions([
    { value: 7, label: translate("每周") },
    { value: 14, label: translate("每 2 周") },
    { value: 30, label: translate("每月") },
  ]);
}

export function loopPollIntervalOptions(): DialogSelectOption[] {
  return numberSelectOptions([
    { value: 15, label: "15 分钟" },
    { value: 60, label: translate("1 小时") },
    { value: 240, label: translate("4 小时") },
  ]);
}

export function loopMailPollIntervalOptions(): DialogSelectOption[] {
  return numberSelectOptions([
    { value: 15, label: translate("每 15 分钟") },
    { value: 30, label: translate("每 30 分钟") },
    { value: 60, label: translate("每小时") },
    { value: 240, label: translate("每 4 小时") },
  ]);
}

export function loopCheckIntervalHourOptions(): DialogSelectOption[] {
  return numberSelectOptions([
    { value: 24, label: translate("每天") },
    { value: 72, label: translate("每 3 天") },
    { value: 168, label: translate("每周") },
  ]);
}

export function loopWakeBeforeMinuteOptions(): DialogSelectOption[] {
  return numberSelectOptions([
    { value: 60, label: translate("1 小时") },
    { value: 1440, label: translate("1 天") },
    { value: 4320, label: translate("3 天") },
  ]);
}

export function loopInterviewSelectOptions(
  items: ReadonlyArray<{ id: string; roundNumber: number; scheduledAt: string | null }>,
): DialogSelectOption[] {
  return items.map((item) => ({
    value: item.id,
    label: `${translateFormat("第 {round} 轮", { round: item.roundNumber })} · ${
      item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : ""
    }`,
  }));
}
