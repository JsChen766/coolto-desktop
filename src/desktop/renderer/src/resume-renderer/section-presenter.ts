import type { ResumeContact, ResumeSection, ResumeSectionItem } from "../../../../resume/types.js";
import { safeContactLink } from "./contact-link.js";

const SECTION_ORDER: Readonly<Record<string, number>> = {
  education: 0, experience: 1, project: 2, other: 3, skill: 4, skills: 4,
};

export interface ResumePresentedContact {
  text: string;
  href?: string;
}

export interface ResumePresentedLine {
  primary: string;
  side: string;
  primaryClass: "resume-document-entry-primary" | "resume-document-entry-secondary";
}

export interface ResumeItemPresentation {
  primary: ResumePresentedLine;
  secondary?: ResumePresentedLine;
}

/** Keeps template field meanings outside the shared DOM renderer. */
export function presentResumeItem(
  item: ResumeSectionItem,
  sectionType: ResumeSection["type"],
): ResumeItemPresentation {
  if (sectionType === "education") return presentEducation(item);
  const secondary = optionalLine(
    item.role ?? "",
    splitOrganizationLocation(item).location,
    "resume-document-entry-secondary",
  );
  return {
    primary: line(
      join(item.title, splitOrganizationLocation(item).organization) || item.role || "",
      dateRange(item),
      "resume-document-entry-primary",
    ),
    ...(secondary ? { secondary } : {}),
  };
}

export function presentResumeContacts(
  contact: ResumeContact | null,
): ResumePresentedContact[] {
  if (!contact) return [];
  return [
    textContact(contact.phone),
    textContact(contact.email),
    textContact(contact.location),
    linkContact(contact.linkedin),
    linkContact(contact.github),
    linkContact(contact.website),
  ].filter((value): value is ResumePresentedContact => Boolean(value));
}

export function orderResumeSections(
  sections: readonly ResumeSection[],
): ResumeSection[] {
  return sections
    .map((section, index) => ({ section, index }))
    .sort((left, right) =>
      (SECTION_ORDER[left.section.type] ?? 3.5) -
        (SECTION_ORDER[right.section.type] ?? 3.5) || left.index - right.index)
    .map(({ section }) => section)
    .filter((section) => section.type !== "summary");
}

function presentEducation(item: ResumeSectionItem): ResumeItemPresentation {
  const secondary = optionalLine(
    join(item.organization, item.role),
    (item.location ?? "").trim(),
    "resume-document-entry-secondary",
  );
  return {
    primary: line(item.title ?? "", dateRange(item), "resume-document-entry-primary"),
    ...(secondary ? { secondary } : {}),
  };
}

function line(
  primary: string,
  side: string,
  primaryClass: ResumePresentedLine["primaryClass"],
): ResumePresentedLine {
  return { primary, side, primaryClass };
}

function optionalLine(
  primary: string,
  side: string,
  primaryClass: ResumePresentedLine["primaryClass"],
): ResumePresentedLine | undefined {
  return primary || side ? line(primary, side, primaryClass) : undefined;
}

function textContact(value: string | null | undefined): ResumePresentedContact | undefined {
  const text = value?.trim();
  return text ? { text } : undefined;
}

function linkContact(value: string | null | undefined): ResumePresentedContact | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  const href = safeContactLink(text);
  return href ? { text, href } : undefined;
}

function splitOrganizationLocation(item: ResumeSectionItem): {
  organization: string;
  location: string;
} {
  const organization = (item.organization ?? "").trim();
  if (item.location || !organization) {
    return { organization, location: (item.location ?? "").trim() };
  }
  const parts = organization
    .split(/\s+(?:·|•|\||｜|,|，)\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return parts.length === 2
    ? { organization: parts[0] ?? "", location: parts[1] ?? "" }
    : { organization, location: "" };
}

function dateRange(item: ResumeSectionItem): string {
  return [item.start_date, item.end_date].filter(Boolean).join(" – ");
}

function join(...values: Array<string | null | undefined>): string {
  return values.map((value) => value?.trim()).filter(Boolean).join(" · ");
}
