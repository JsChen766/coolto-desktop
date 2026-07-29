export function buildJdActionInstruction(
  action: "generate" | "match",
  title: string,
): string {
  return action === "generate"
    ? `请为岗位「${title}」生成针对性简历。`
    : `请为岗位「${title}」匹配经历库，并给出匹配结果。`;
}
