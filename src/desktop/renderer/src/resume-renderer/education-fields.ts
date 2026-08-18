import type { ResumeSectionItem } from "../../../../resume/types.js";

export interface PresentedEducationFields {
  school: string;
  degree: string;
  major: string;
  college: string;
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
      college: role && !roleParts.degree ? role : "",
    };
  }

  if (looksLikeInstitution(organization) || titleParts.degree) {
    return {
      school: organization,
      degree: titleParts.degree || roleParts.degree,
      major: titleParts.major || (roleParts.degree ? roleParts.major : title),
      college: role && !roleParts.degree ? role : "",
    };
  }

  return {
    school: organization || title,
    degree: roleParts.degree,
    major: organization ? title : roleParts.major,
    college: role && !roleParts.degree ? role : "",
  };
}

function splitDegreeAndMajor(value: string): { degree: string; major: string } {
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
