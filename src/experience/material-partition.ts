const MONTH = "\\d{4}(?:[./-](?:0?[1-9]|1[0-2])|年(?:0?[1-9]|1[0-2])月?)";
const EDUCATION_RANGE = new RegExp(
  `(?:^|[^\\d])(${MONTH})\\s*(?:-|–|—|~|至|到)\\s*(${MONTH}|present|至今)(?=\\s|$|[，,;；|｜])`,
  "giu",
);

export function assertSingleEducationPeriod(text: string): void {
  const periods = new Set<string>();
  for (const match of text.matchAll(EDUCATION_RANGE)) {
    periods.add(`${normalize(match[1]!)}|${normalize(match[2]!)}`);
  }
  if (periods.size > 1) {
    throw new Error("检测到多个教育时间区间，请拆成独立教育经历后分别沉淀");
  }
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace("年", "-").replace("月", "")
    .replaceAll(/[./]/gu, "-");
}
