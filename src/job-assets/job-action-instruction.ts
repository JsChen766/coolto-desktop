export function buildJdActionInstruction(
  action: "generate" | "match",
  title: string,
): string {
  return action === "generate"
    ? `请为岗位「${title}」生成针对性简历。`
    : `请为岗位「${title}」匹配经历库，并给出匹配结果。`;
}

export function buildInterviewQuestionsInstruction(title: string): string {
  return `请根据我的经历和岗位「${title}」，帮我准备面试问题与作答要点。`;
}

export function buildAnalyzeJdPageInstruction(title: string, url: string): string {
  return `请分析当前浏览器中的岗位页面「${title}」并准备入库。页面地址：${url}。优先读取当前浏览器页面；若页面不可用，再抓取该公开链接。`;
}
