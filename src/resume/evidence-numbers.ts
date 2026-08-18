/**
 * Extracts every number-like token from a value and canonicalizes it so that
 * equivalent spellings compare equal: "10万+", "100,000+" and "100000" all
 * canonicalize to "100000"; "第十八届" canonicalizes to "18"; "3.3" stays
 * "3.3" and never equals "3"; "two" and "2" both canonicalize to "2".
 * Percentages keep their numeric value ("80%" -> "80").
 */
export function extractEvidenceNumbers(value: string): string[] {
  // Compound English numbers ("twenty-one") are matched first and blanked
  // out so the single-word pass cannot double-extract "twenty" + "one".
  const compoundEnglish = [...value.matchAll(ENGLISH_COMPOUND_REGEX)].map(
    (match) => match[0],
  );
  const withoutCompounds = value.replace(ENGLISH_COMPOUND_REGEX, " ");
  const tokens = [
    ...value.matchAll(
      /(?<![\p{L}\d])(?:\p{Sc}\s*)?\d[\d,]*(?:\.\d+)?(?:万|亿|千|百|[KMB])?(?:\+)?(?:\s*%)?(?![\p{L}\d])/giu,
    ),
    ...[...value.matchAll(/[零一二两三四五六七八九十百千万亿]+/gu)]
      .filter((match) => isUnambiguousChineseNumber(value, match)),
    ...compoundEnglish,
    ...[...withoutCompounds.matchAll(ENGLISH_WORD_REGEX)].map(
      (match) => match[0],
    ),
  ];
  return tokens
    .map((match) =>
      (typeof match === "string" ? match : match[0]).toLowerCase(),
    )
    // A standalone 一 is overwhelmingly a character-level morpheme
    // ("一级", "第一", "统一"), not a numeric claim; treating it as a
    // number mis-rejects Chinese resumes built from English evidence.
    // Other single Chinese digits (三/两/…/十) stay verifiable claims
    // ("三大支柱", "十大市场"). A standalone unit character (百/千/万/亿)
    // without any digit character is vague wording ("数百", "上千", "上亿"),
    // not a specific numeric claim, and must not be treated as a number.
    .filter(
      (token) =>
        token !== "一" &&
        (/[零一二两三四五六七八九十]/.test(token) ||
          !/^[百千万亿]+$/u.test(token)),
    )
    .map(canonicalNumber);
}

function canonicalNumber(token: string): string {
  // The extractor intentionally keeps a leading currency symbol in the
  // matched token so "$1.44" is captured as one number. Currency is a unit,
  // not part of the numeric value: source "$1.44 trillion" must verify a
  // localized bullet such as "1.44 万亿美元".
  const clean = token.replace(/[\p{Sc},\s]/gu, "").toLowerCase();
  if (/^[a-z-]+$/.test(clean)) {
    // English number words: "two" -> "2", "twenty-one" -> "21". Mapping them
    // to Arabic lets a Chinese resume ("两大国企") verify against English
    // evidence ("two major SOEs") and vice versa.
    const direct = ENGLISH_NUMBER_WORDS[clean];
    if (direct !== undefined) return direct;
    const [tens, ones] = clean.split("-");
    if (tens !== undefined && ones !== undefined) {
      const tensValue = ENGLISH_NUMBER_WORDS[tens];
      const onesValue = ENGLISH_NUMBER_WORDS[ones];
      if (tensValue !== undefined && onesValue !== undefined) {
        return String(Number(tensValue) + Number(onesValue));
      }
    }
    return clean;
  }
  const arabic = /^(\d+(?:\.\d+)?)(万|亿|千|百|k|m|b)?\+?%?$/.exec(clean);
  if (arabic) {
    let value = Number.parseFloat(arabic[1]!);
    const unit = arabic[2];
    if (unit === "万") value *= 10_000;
    else if (unit === "亿") value *= 100_000_000;
    else if (unit === "千") value *= 1_000;
    else if (unit === "百") value *= 100;
    else if (unit === "k") value *= 1_000;
    else if (unit === "m") value *= 1_000_000;
    else if (unit === "b") value *= 1_000_000_000;
    return String(value);
  }
  if (/[零一二两三四五六七八九十]/.test(clean)) {
    const chinese = chineseNumberValue(clean);
    if (chinese !== undefined) return String(chinese);
  }
  return clean;
}

function isUnambiguousChineseNumber(
  source: string,
  match: RegExpMatchArray,
): boolean {
  const token = match[0];
  if (token.length > 1) return true;
  if (token === "一" || /^[百千万亿]$/u.test(token)) return false;
  const next = source[(match.index ?? 0) + token.length] ?? "";
  return new Set([
    "个", "家", "份", "次", "项", "届", "年", "月", "天", "周", "人",
    "名", "所", "场", "篇", "页", "条", "轮", "种", "类", "倍", "成",
    "余", "大",
  ]).has(next);
}

const ENGLISH_NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  seventy: "70",
  eighty: "80",
  ninety: "90",
  hundred: "100",
  thousand: "1000",
  million: "1000000",
  billion: "1000000000",
};

const ENGLISH_COMPOUND_REGEX =
  /\b(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(?:one|two|three|four|five|six|seven|eight|nine)\b/gi;

const ENGLISH_WORD_REGEX =
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/gi;

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
