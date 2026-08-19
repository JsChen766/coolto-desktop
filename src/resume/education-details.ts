export interface EducationDetails {
  gpa: string;
  ranking: string;
  courses: string;
}

export interface EducationSupplementalPresentation {
  performance: string;
  coursework: string;
}

/** Extracts only explicitly stated education facts; unmatched prose is omitted. */
export function extractEducationDetails(
  source: string | null | undefined,
): EducationDetails {
  const text = cleanSource(source);
  return {
    gpa: extractGpa(text),
    ranking: extractRanking(text),
    courses: extractCourses(text),
  };
}

/** Stores a deterministic, display-ready education supplement in raw_text. */
export function projectEducationRawText(
  source: string | null | undefined,
  language: string,
  courses: readonly string[] = [],
): string | null {
  const extracted = extractEducationDetails(source);
  const details = {
    ...extracted,
    courses: presentCourses(courses, language),
  };
  const presented = presentEducationSupplement(details, language);
  const lines = [presented.performance, presented.coursework].filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

export function presentEducationSupplement(
  details: EducationDetails,
  language: string,
): EducationSupplementalPresentation {
  const chinese = language.toLocaleLowerCase().startsWith("zh");
  const performance = details.gpa
    ? `GPA ${details.gpa}${details.ranking
      ? chinese ? `（${details.ranking}）` : ` (${details.ranking})`
      : ""}`
    : details.ranking;
  const coursework = details.courses
    ? `${chinese ? "主修课程：" : "Relevant Coursework: "}${details.courses}`
    : "";
  return { performance, coursework };
}

function extractGpa(text: string): string {
  const match = text.match(
    /(?:\bGPA\b|平均绩点|绩点)[ \t]*(?:[:：]|为|是)?[ \t]*(\d+(?:\.\d+)?(?:[ \t]*\/[ \t]*\d+(?:\.\d+)?)?)/iu,
  );
  return match?.[1]?.replace(/[ \t]+/gu, "") ?? "";
}

function extractRanking(text: string): string {
  const percentage = text.match(
    /(?:(专业|年级|综合|班级)[ \t]*)?(?:成绩[ \t]*)?(?:排名[ \t]*)?(?:位列[ \t]*)?前[ \t]*(\d+(?:\.\d+)?)[ \t]*%/u,
  );
  if (percentage?.[2]) {
    return `${percentage[1] ?? ""}前 ${percentage[2]}%`;
  }
  const top = text.match(/\btop[ \t]+(\d+(?:\.\d+)?)[ \t]*%/iu);
  if (top?.[1]) return `Top ${top[1]}%`;
  const fraction = text.match(
    /(?:(专业|年级|综合|班级)[ \t]*)?(?:成绩[ \t]*)?排名[ \t]*(?:第[ \t]*)?(\d+)[ \t]*\/[ \t]*(\d+)/u,
  );
  if (fraction?.[2] && fraction[3]) {
    return `${fraction[1] ?? ""}排名 ${fraction[2]}/${fraction[3]}`;
  }
  return "";
}

function extractCourses(text: string): string {
  const line = text.split(/\r?\n/u).map((value) => value.trim()).find(
    (value) => value.startsWith("主修课程:") ||
      value.startsWith("Relevant Coursework:"),
  );
  if (!line) return "";
  const separator = line.indexOf(":") >= 0 ? ":" : "：";
  return cleanCourses(line.slice(line.indexOf(separator) + 1));
}

function presentCourses(courses: readonly string[], language: string): string {
  const cleaned = [...new Set(courses.map((course) => course.trim()).filter(Boolean))];
  if (!cleaned.length) return "";
  const englishOnly = cleaned.every((course) =>
    !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
      .test(course)
  );
  return cleaned.join(language.toLowerCase().startsWith("zh") && !englishOnly
    ? "、"
    : ", ");
}

function cleanCourses(value: string): string {
  return value
    .replace(/^[：:、,，\s]+/u, "")
    .replace(/[。.!！?？；;，,\s]+$/u, "")
    .trim();
}

function cleanSource(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/^[ \t]*(?:[-*•]|\d+[.)、])[ \t]*/gmu, "")
    .trim();
}
