export const INITIAL_MATERIAL_MARKER = "【需要补充事实】";
export const SCENARIO_PROBE_MARKER = "【帮你一起回忆】";

export function initialMaterialQuestion(question: string): string {
  const value = question.trim();
  return value.startsWith(INITIAL_MATERIAL_MARKER)
    ? value
    : `${INITIAL_MATERIAL_MARKER}${value}`;
}

export function scenarioMaterialQuestion(questions: readonly string[]): string {
  const values = questions.map((value) => value.trim()).filter(Boolean);
  return [
    `${SCENARIO_PROBE_MARKER}如果你希望一起回忆，可以看看下面这些岗位场景，告诉我哪些是你确实做过的；没有做过的直接说没有：`,
    ...values.map((value, index) => `${index + 1}. ${value}`),
    "如果其中有做过的，请补充当时的对象、范围、方法、交付物或结果；如果都没有，直接说没有即可，我不会要求再次确认。",
  ].join("\n");
}
