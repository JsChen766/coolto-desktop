import { extractEvidenceNumbers } from "../resume/evidence-numbers.js";

const CRITICAL_TERMS = [
  "报告", "模型", "系统", "功能", "产品", "策略", "代码", "脚本",
  "活动", "看板", "方案", "原型", "SOP", "流程", "研究", "分析",
  "交付", "上线", "发布", "完成", "输出", "撰写", "开发", "设计",
  "制作", "搭建", "建立", "实现", "结论", "建议", "成果", "论文",
  "专利", "白皮书", "数据集", "数据库", "指标体系", "需求文档", "PRD",
  "算法", "实验结果", "测试结果", "评估结果", "预测", "洞察", "营收",
  "成交", "转化率", "增长", "降本", "提效", "节省", "签约", "获客",
  "复购", "留存", "用户研究", "竞品分析", "财务模型", "估值",
  "投资建议", "调研纪要", "访谈纪要", "文章", "网页", "课程",
  "奖项", "认证", "合同", "提案", "演示文稿",
  "report", "model", "system", "feature", "strategy", "dashboard",
  "analysis", "research", "launch", "deliver", "build", "develop", "paper",
  "patent", "dataset", "database", "whitepaper", "prototype", "algorithm",
  "experiment", "conversion", "revenue", "retention", "growth", "contract",
] as const;
const CRITICAL_PATTERN = new RegExp(CRITICAL_TERMS.join("|"), "iu");
const QUANTITATIVE_PATTERN = /(?:(?:约|近|超过|超|逾|至少|最多|累计|同比|环比|top|approximately|about|over|more than|at least|up to|usd|cny|rmb|hk\$|us\$|[$¥￥])\s*)?(?:\d+(?:[.,]\d+)?|[一二三四五六七八九十百千万亿两数]+)(?:\s*[-–—~至到]\s*(?:\d+(?:[.,]\d+)?|[一二三四五六七八九十百千万亿两数]+))?\s*(?:%|％|个|家|人|次|页|年|月|天|小时|分钟|秒|元|美元|港元|万元|亿元|万|亿|千|百|k|m|b|条|份|项|组|种|轮|名|倍|百分点|people|users?|clients?|companies|markets?|pages?|years?|months?|days?|hours?|minutes?|seconds?|rmb|cny|usd|dollars?|million|billion|thousand|points?|items?|times?|x)/giu;

export function materialNumbers(text: string): string[] {
  const phrases = [...text.matchAll(QUANTITATIVE_PATTERN)]
    .map((match) => match[0].trim())
    .filter(Boolean);
  const coveredCanonical = new Set(
    phrases.flatMap((phrase) => extractEvidenceNumbers(phrase)),
  );
  const bare = extractEvidenceNumbers(text)
    .filter((number) => !coveredCanonical.has(number));
  return [...new Set([...phrases, ...bare])];
}

export function materialCriticalTexts(text: string): string[] {
  return [...new Set(text
    .split(/(?<=[。！？.!?])\s*|\n+/u)
    .map((value) => value.trim())
    .filter((value) => value.length >= 8 && CRITICAL_PATTERN.test(value)))];
}

export function minimumDetailChars(sourceLength: number): number {
  if (sourceLength <= 800) return sourceLength;
  return Math.min(5_000, Math.ceil(sourceLength * 0.8));
}

export function missingNumbers(source: string[], detailedText: string): string[] {
  const normalizedDetail = quantitativeKey(detailedText);
  const recordedCanonical = new Set(extractEvidenceNumbers(detailedText));
  return source.filter((value) => {
    if (normalizedDetail.includes(quantitativeKey(value))) return false;
    const canonical = extractEvidenceNumbers(value);
    return canonical.length === 1 && !/[\p{L}%％]/u.test(value)
      ? !recordedCanonical.has(canonical[0]!)
      : true;
  });
}

function quantitativeKey(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase();
}

export function missingCriticalTexts(
  source: string[],
  covered: readonly string[],
  detailedText: string,
): string[] {
  const values = new Set(covered.map((value) => value.trim()));
  const normalizedDetail = contentKey(detailedText);
  return source.filter((value) => {
    if (!values.has(value)) return true;
    return !normalizedDetail.includes(contentKey(value));
  });
}

function contentKey(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}
