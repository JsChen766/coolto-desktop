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
    `${SCENARIO_PROBE_MARKER}没关系，我们先不要求你准备正式材料。请回想下面这些该岗位常见的真实工作场景，告诉我哪些是你确实做过的；没有做过的直接说没有：`,
    ...values.map((value, index) => `${index + 1}. ${value}`),
    "如果其中有做过的，请补充当时的对象、范围、方法、交付物或结果；如果这些都没有做过，请明确回复“这些都没有”，我会只基于现有事实做不新增事实的表达充实。",
  ].join("\n");
}
