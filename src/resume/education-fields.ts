import type { ResumeSectionItem } from "./types.js";

export interface PresentedEducationFields {
  school: string;
  degree: string;
  major: string;
}

/** Adapts both historical degree-first records and canonical school-first records. */
export function educationFields(item: ResumeSectionItem): PresentedEducationFields {
  const title = clean(item.title);
  const organization = clean(item.organization);
  const role = clean(item.role);
  const titleParts = splitDegreeAndMajor(title);
  const roleParts = splitDegreeAndMajor(role);

  if (looksLikeInstitution(title) || (!looksLikeInstitution(organization) && roleParts.degree)) {
    return {
      school: title,
      degree: roleParts.degree || (looksLikeDegree(role) ? role : ""),
      major: organization || roleParts.major,
    };
  }

  if (looksLikeInstitution(organization) || titleParts.degree) {
    return {
      school: organization,
      degree: titleParts.degree || roleParts.degree,
      major: titleParts.major || (roleParts.degree ? roleParts.major : title),
    };
  }

  return {
    school: organization || title,
    degree: roleParts.degree,
    major: organization ? title : roleParts.major,
  };
}

function splitDegreeAndMajor(value: string): { degree: string; major: string } {
  const qualifiedChinese = value.match(
    /^(.*?)(理学|工学|文学|法学|经济学|管理学|教育学|医学|农学|艺术学|哲学)(博士|硕士|学士)([（(].+[）)])?$/u,
  );
  if (qualifiedChinese) {
    return {
      degree: `${qualifiedChinese[2] ?? ""}${qualifiedChinese[3] ?? ""}`,
      major: `${qualifiedChinese[1] ?? ""}${qualifiedChinese[4] ?? ""}`.trim(),
    };
  }
  const chinese = value.match(/^(.*?)(博士|硕士|学士|本科|专科)([（(].+[）)])?$/u);
  if (chinese) {
    return {
      degree: chinese[2] ?? "",
      major: `${chinese[1] ?? ""}${chinese[3] ?? ""}`.trim(),
    };
  }
  const english = value.match(
    /^((?:Master|Bachelor|Doctor)(?:'s)?(?:\s+of\s+[A-Za-z &-]+)?|M\.?Sc\.?|M\.?S\.?|B\.?Sc\.?|B\.?S\.?|B\.?A\.?|M\.?A\.?|MBA|Ph\.?D\.?)\s+(?:in|of)\s+(.+)$/iu,
  );
  if (english) return { degree: english[1]?.trim() ?? "", major: english[2]?.trim() ?? "" };
  return looksLikeDegree(value) ? { degree: value, major: "" } : { degree: "", major: "" };
}

function looksLikeInstitution(value: string): boolean {
  return /(?:大学|学院|学校|研究院|University|College|Institute|School)/iu.test(value);
}

function looksLikeDegree(value: string): boolean {
  return /(?:博士|硕士|学士|本科|专科|Bachelor|Master|Doctor|MBA|M\.?Sc|M\.?S|B\.?Sc|B\.?S|B\.?A|M\.?A|Ph\.?D)/iu.test(value);
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}
