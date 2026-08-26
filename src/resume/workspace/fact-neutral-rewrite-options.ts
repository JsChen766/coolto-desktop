import type { TailLengthBudget } from "./tail-length-budget.js";

const ZH_CONNECTORS = [
  ["同时"],
  ["并在此基础上"],
  ["并据此进一步", "同时"],
  ["并在既有分析基础上进一步", "同时围绕上述影响"],
  ["并在既有研究基础上进一步", "同时围绕上述影响", "并结合前述分析"],
  ["并在既有研究与分析基础上进一步", "同时围绕上述影响与判断", "并结合上述分析"],
] as const;

const EN_CONNECTORS = [
  ["while"],
  ["and in this context"],
  ["and on that basis", "while also"],
  ["and building on the analysis", "while considering the stated impact"],
  ["and building on the existing research", "while considering the stated impact", "and based on that analysis"],
] as const;

export function factNeutralRewriteOptions(input: {
  bulletId: string;
  currentText: string;
  language: string;
  budget?: TailLengthBudget;
}): string[] {
  const groups = input.language === "zh-CN" ? ZH_CONNECTORS : EN_CONNECTORS;
  const delimiter = input.language === "zh-CN" ? "，" : ",";
  const target = input.budget?.idealGrowthCjk ?? 12;
  const ordered = groups.map((connectors, index) => {
    const text = insertAfterDelimiters(
      input.currentText, delimiter, connectors,
    );
    return { text, index, distance: Math.abs(
      visualUnits(text) - visualUnits(input.currentText) - target,
    ) };
  }).filter((entry, index, values) =>
    entry.text !== input.currentText &&
    values.findIndex((candidate) => candidate.text === entry.text) === index
  ).sort((left, right) =>
    left.distance - right.distance || rotateRank(
      left.index, right.index, groups.length, hash(input.bulletId),
    )
  );
  return ordered.slice(0, 2).map(({ text }) => text);
}

function insertAfterDelimiters(
  text: string,
  delimiter: string,
  connectors: readonly string[],
): string {
  let inserted = 0;
  let result = "";
  for (const character of text) {
    result += character;
    if (character === delimiter && inserted < connectors.length) {
      result += `${connectors[inserted]}${delimiter === "," ? " " : ""}`;
      inserted += 1;
    }
  }
  if (inserted) return result;
  const separator = delimiter === "," ? ", " : "，";
  return `${connectors[0]}${separator}${text}`;
}

function visualUnits(value: string): number {
  return [...value].reduce((total, character) =>
    total + (/\p{Script=Han}/u.test(character)
      ? 1 : /\s/u.test(character) ? 0.25 : 0.5), 0);
}

function rotateRank(
  left: number,
  right: number,
  length: number,
  offset: number,
): number {
  const normalizedOffset = offset % length;
  return (left - normalizedOffset + length) % length -
    ((right - normalizedOffset + length) % length);
}

function hash(value: string): number {
  return [...value].reduce((total, character) =>
    (total * 31 + (character.codePointAt(0) ?? 0)) >>> 0, 0
  );
}
