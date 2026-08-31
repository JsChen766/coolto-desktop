export const INITIAL_MATERIAL_MARKER = "【需要补充事实】";
export const SCENARIO_PROBE_MARKER = "【帮你一起回忆】";
export const FOLLOW_UP_MATERIAL_MARKER = "【继续补充】";

const INVITATION_SUFFIX =
  "如果你愿意补充，请直接告诉我对应的真实情况；如果不需要补充，也请直接说不需要，我会跳过补充并进入最终收尾。";

export function initialMaterialQuestion(question: string): string {
  const value = question.trim().replace(INITIAL_MATERIAL_MARKER, "");
  const suffix = value.includes("如果不需要补充") ? "" : INVITATION_SUFFIX;
  return `${INITIAL_MATERIAL_MARKER}${value}${suffix}`;
}

export function scenarioMaterialQuestion(questions: readonly string[]): string {
  const values = questions.map((value) => value.trim()).filter(Boolean);
  return [
    `${SCENARIO_PROBE_MARKER}如果你希望一起回忆，可以看看下面这些岗位场景，告诉我哪些是你确实做过的；没有做过的直接说没有：`,
    ...values.map((value, index) => `${index + 1}. ${value}`),
    "如果其中有做过的，请补充当时的对象、范围、方法、交付物或结果；如果都没有，直接说没有即可，我不会要求再次确认。",
  ].join("\n");
}

export function followUpMaterialQuestion(): string {
  return `${FOLLOW_UP_MATERIAL_MARKER}我已经把这次补充写进当前简历。你还有其他想补充的真实事实或材料吗？有的话请直接告诉我；如果没有，直接说没有，我会进入最终收尾。`;
}
