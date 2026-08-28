const ZH_FIRST_CONNECTORS = [
  "其中", "同时", "在此基础上", "结合前述背景", "围绕上述目标",
  "基于前述背景与目标", "结合前述背景与工作目标",
  "围绕前述背景、目标与相关重点",
] as const;

const ZH_LATER_CONNECTORS = [
  "其中", "同时", "据此", "在此基础上", "基于前述内容",
  "结合上述方法", "围绕前述分析", "在前述分析与判断基础上",
  "在前述分析及其相关判断基础上",
] as const;

const EN_CONNECTORS = [
  "in context", "in this context", "at the same time", "on that basis",
  "within this scope", "for this purpose", "within the stated context",
  "with the preceding context in view",
  "within the broader analytical context",
  "with the relationship between the factual components explicit",
] as const;

const ZH_OPENINGS = [
  "就此而言", "在此背景下", "就该项工作而言", "结合前述背景与目标",
  "围绕前述背景与相关判断", "就前述背景、工作目标与相关判断而言",
  "结合前述背景、工作目标与各部分已有内容",
  "就前述背景、工作目标与各部分已有事实之间的关系而言",
  "在前述背景、工作目标与各部分已有事实关系均保持明确的前提下",
] as const;

const EN_OPENINGS = [
  "in context", "as presented", "within context", "within this context",
  "within the stated context", "within the broader context",
  "within the stated analytical context",
  "with the underlying context kept explicit",
  "with the existing context kept clear throughout",
  "with the analytical context kept clear throughout",
  "with the analytical structure kept clear throughout",
  "with the existing analytical context presented consistently",
  "within a clear and consistent analytical structure throughout",
  "with the underlying context and analytical structure kept clear throughout",
  "with the analysis presented in a clear and consistent structure throughout",
  "with the analysis presented in a clear and consistent structure and the underlying context kept explicit throughout",
] as const;

export interface FactNeutralRewriteVariant {
  text: string;
  placementRank: number;
}

export function factNeutralRewriteVariants(
  text: string,
  language: string,
  offset: number,
): FactNeutralRewriteVariant[] {
  const boundaries = insertionBoundaries(text, language);
  if (!boundaries.length) return openingVariants(text, language);
  const variants: FactNeutralRewriteVariant[] = [];
  const maximumInsertions = Math.min(3, boundaries.length);
  for (let count = 1; count <= maximumInsertions; count += 1) {
    for (let start = 0; start < boundaries.length; start += 1) {
      const selected = Array.from({ length: count }, (_, index) =>
        boundaries[(start + index) % boundaries.length]!
      ).sort((left, right) => left - right);
      for (let shift = 0; shift < 8; shift += 1) {
        const phrases = selected.map((boundary, index) => connectorForBoundary({
          language,
          boundaryIndex: boundaries.indexOf(boundary),
          boundaryCount: boundaries.length,
          offset: offset + start + index * 3 + count + shift * 2,
        }));
        variants.push({
          text: insertAtBoundaries(text, selected, phrases, language),
          placementRank: 0,
        });
      }
    }
  }
  return [...variants, ...openingVariants(text, language).map((variant) => ({
    ...variant,
    placementRank: 1,
  }))].filter((variant) => !hasBoundaryEcho(variant.text, language));
}

function openingVariants(
  text: string,
  language: string,
): FactNeutralRewriteVariant[] {
  const phrases = language === "zh-CN" ? ZH_OPENINGS : EN_OPENINGS;
  const delimiter = language === "zh-CN" ? "，" : ", ";
  return phrases.map((phrase) => ({
    text: `${phrase}${delimiter}${text.trimStart()}`,
    placementRank: 0,
  }));
}

function insertionBoundaries(text: string, language: string): number[] {
  const boundaries: number[] = [];
  const punctuation = language === "zh-CN" ? /[，；]/gu : /;\s+/gu;
  for (const match of text.matchAll(punctuation)) {
    boundaries.push(match.index + match[0].length);
  }
  return [...new Set(boundaries)].sort((left, right) => left - right);
}

function connectorForBoundary(input: {
  language: string;
  boundaryIndex: number;
  boundaryCount: number;
  offset: number;
}): string {
  const values = input.language !== "zh-CN"
    ? EN_CONNECTORS
    : input.boundaryIndex === 0 && input.boundaryCount > 1
      ? ZH_FIRST_CONNECTORS : ZH_LATER_CONNECTORS;
  return values[input.offset % values.length]!;
}

function insertAtBoundaries(
  text: string,
  boundaries: readonly number[],
  phrases: readonly string[],
  language: string,
): string {
  let result = text;
  for (let index = boundaries.length - 1; index >= 0; index -= 1) {
    const boundary = boundaries[index]!;
    const before = result.slice(0, boundary);
    const after = result.slice(boundary);
    const alreadyDelimited = /[，；;,]\s*$/u.test(before);
    const leading = alreadyDelimited ? "" : language === "zh-CN" ? "，" : ", ";
    const trailing = language === "zh-CN" ? "，" : ", ";
    result = `${before}${leading}${phrases[index]}${trailing}${after}`;
  }
  return result;
}

function hasBoundaryEcho(text: string, language: string): boolean {
  if (language !== "zh-CN") {
    return /\b(within|with|in)\b[^;]{0,60};\s*\1\b/iu.test(text);
  }
  return /(围绕|结合|基于)[^，；]{0,24}[，；]\1/u.test(text);
}
