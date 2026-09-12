import type { InterviewRound } from "@desktop/types";

import { translate, translateFormat } from "../i18n/locale";
import type { DialogSelectOption } from "./dialog-select-types";

export function interviewRoundSelectOptions(interviews: InterviewRound[]): DialogSelectOption[] {
  return [
    { value: "", label: translate("不关联") },
    ...interviews.map((item) => ({
      value: item.id,
      label: translateFormat("第 {round} 轮", { round: item.roundNumber }),
    })),
  ];
}

export function recordToSelectOptions(record: Record<string, string>): DialogSelectOption[] {
  return Object.entries(record).map(([value, label]) => ({ value, label }));
}

export function numberSelectOptions(
  items: ReadonlyArray<{ value: number; label: string }>,
): DialogSelectOption[] {
  return items.map((item) => ({ value: String(item.value), label: item.label }));
}
