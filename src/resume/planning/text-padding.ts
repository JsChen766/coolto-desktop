const TAIL_WINDOW_CHARACTERS = 64;
const ABSTRACT_CHAIN =
  /(?:方法论|经验|最佳实践|标准化流程|推广策略)(?:与(?:方法论|经验|最佳实践|标准化流程|推广策略)){3,}/u;
const ABSTRACT_COGNITION_SUFFIX =
  /形成(?:覆盖.{0,12})?(?:行业认知|投资判断|业务认知|分析认知)(?:与(?:行业认知|投资判断|业务认知|分析认知))*$/u;
const VAGUE_COVERAGE_OR_SUPPORT = [
  /形成.{0,18}完整(?:理解|认知)[，,](?:并)?覆盖/u,
  /覆盖.{0,20}(?:全流程|全生命周期|全业务线|全链条)$/u,
  /覆盖从.{0,18}到.{0,18}全环节并形成(?:统一|完整)结论$/u,
  /(?:支撑|提供).{0,20}(?:量化)?(?:依据|决策支撑)$/u,
  /(?:可复用|标准化).{0,16}(?:框架|方法论).{0,12}(?:依据|支撑)$/u,
  /(?:长期竞争力|运营韧性|战略韧性)(?:与(?:运营韧性|战略韧性))*$/u,
];
const VAGUE_SUFFIXES = [
  /推动最优方案落地$/u,
  /形成(?:数据驱动决策)?闭环$/u,
  /沉淀(?:可复用|标准化)?(?:方法论|课程体系)$/u,
  /保障学习效果$/u,
  /为后续(?:分析|优化|迭代).{0,8}奠定.{0,4}基础$/u,
];

/** Rejects an obvious generated suffix that chains abstract nouns for width. */
export function findResumePaddingIssue(text: string): string | null {
  const normalized = text.normalize("NFKC").trim();
  if (ABSTRACT_COGNITION_SUFFIX.test(normalized)) return "抽象认知结尾";
  if (VAGUE_SUFFIXES.some((pattern) => pattern.test(normalized))) {
    return "空泛效果结尾";
  }
  if (VAGUE_COVERAGE_OR_SUPPORT.some((pattern) => pattern.test(normalized))) {
    return "空泛覆盖或支撑结尾";
  }
  const tail = [...normalized]
    .slice(-TAIL_WINDOW_CHARACTERS)
    .join("");
  return ABSTRACT_CHAIN.test(tail) ? "连续抽象并列词" : null;
}
