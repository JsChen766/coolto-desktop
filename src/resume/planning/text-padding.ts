const ABSTRACT_CHAIN_CONNECTORS = /与/gu;
const TAIL_WINDOW_CHARACTERS = 64;
const MAX_NATURAL_AND_CONNECTORS = 2;
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
  if (VAGUE_SUFFIXES.some((pattern) => pattern.test(normalized))) {
    return "空泛效果结尾";
  }
  const tail = [...normalized]
    .slice(-TAIL_WINDOW_CHARACTERS)
    .join("");
  const connectorCount = tail.match(ABSTRACT_CHAIN_CONNECTORS)?.length ?? 0;
  return connectorCount > MAX_NATURAL_AND_CONNECTORS
    ? "连续抽象并列词"
    : null;
}
