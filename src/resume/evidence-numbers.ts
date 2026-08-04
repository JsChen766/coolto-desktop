/**
 * Extracts every number-like token from a value and canonicalizes it so that
 * equivalent spellings compare equal: "10万+", "100,000+" and "100000" all
 * canonicalize to "100000"; "第十八届" canonicalizes to "18"; "3.3" stays
 * "3.3" and never equals "3". Percentages keep their numeric value
 * ("80%" -> "80").
 */
export function extractEvidenceNumbers(value: string): string[] {
  const tokens = [
    ...value.matchAll(
      /(?:\p{Sc}\s*)?\d[\d,]*(?:\.\d+)?(?:万|亿|千|百)?(?:\+)?(?:\s*%)?/gu,
    ),
    ...value.matchAll(/[零一二两三四五六七八九十百千万亿]+/gu),
  ];
  return tokens.map((match) => canonicalNumber(match[0]));
}

function canonicalNumber(token: string): string {
  const clean = token.replace(/[,\s]/g, "");
  const arabic = /^(\d+(?:\.\d+)?)(万|亿|千|百)?\+?%?$/.exec(clean);
  if (arabic) {
    let value = Number.parseFloat(arabic[1]!);
    const unit = arabic[2];
    if (unit === "万") value *= 10_000;
    else if (unit === "亿") value *= 100_000_000;
    else if (unit === "千") value *= 1_000;
    else if (unit === "百") value *= 100;
    return String(value);
  }
  if (/[零一二两三四五六七八九]/.test(clean)) {
    const chinese = chineseNumberValue(clean);
    if (chinese !== undefined) return String(chinese);
  }
  return clean;
}

function chineseNumberValue(text: string): number | undefined {
  const digits: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
  const sections: Record<string, number> = { 万: 10_000, 亿: 100_000_000 };
  let total = 0;
  let section = 0;
  let number = 0;
  for (const character of text) {
    if (character in digits) {
      number = digits[character]!;
    } else if (character in units) {
      section += (number === 0 ? 1 : number) * units[character]!;
      number = 0;
    } else if (character in sections) {
      section = (section + number) * sections[character]!;
      total += section;
      section = 0;
      number = 0;
    } else {
      return undefined;
    }
  }
  return total + section + number;
}
