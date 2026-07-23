import type {
  ResumeSection,
  ResumeSectionItem,
  ResumeStructure,
} from "../../../../resume/types";
import {
  applyResumeTemplateStyle,
  type ResumeTemplateManifestEntry,
} from "./template";
import { safeContactLink, setSafeInlineMarkdown } from "./safe-markdown";

const SECTION_ORDER: Readonly<Record<string, number>> = {
  education: 0,
  experience: 1,
  project: 2,
  other: 3,
  skill: 4,
  skills: 4,
};

const SECTION_LABELS: Readonly<Record<string, string>> = {
  education: "Education",
  experience: "Internship Experience",
  project: "Projects",
  projects: "Projects",
  skills: "Additional",
  other: "Additional",
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string | null,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
}

function sortSections(sections: readonly ResumeSection[]): ResumeSection[] {
  return sections
    .map((section, index) => ({ section, index }))
    .sort(
      (left, right) =>
        (SECTION_ORDER[left.section.type] ?? 3.5) -
          (SECTION_ORDER[right.section.type] ?? 3.5) ||
        left.index - right.index,
    )
    .map(({ section }) => section)
    .filter((section) => section.type !== "summary");
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

function entryPrimary(item: ResumeSectionItem): string {
  return (
    [item.title, splitOrganizationLocation(item).organization]
      .filter(Boolean)
      .join(" · ") ||
    item.role ||
    ""
  );
}

function dateRange(item: ResumeSectionItem): string {
  return [item.start_date, item.end_date].filter(Boolean).join(" – ");
}

function appendHeader(content: HTMLElement, structure: ResumeStructure): void {
  const contact = structure.contact;
  const hasContact = Boolean(
    contact?.phone || contact?.email || contact?.location || contact?.linkedin,
  );
  if (!contact?.name && !hasContact) return;
  const header = element("header", "resume-document-header");
  if (contact?.name) {
    header.append(element("span", "resume-document-name", contact.name));
  }
  if (hasContact) {
    const line = element("div", "resume-document-contact");
    for (const value of [contact?.phone, contact?.email, contact?.location]) {
      if (value) line.append(element("span", undefined, value));
    }
    if (contact?.linkedin) {
      const link = element("a", "resume-document-link", contact.linkedin);
      link.href = safeContactLink(contact.linkedin);
      link.target = "_blank";
      link.rel = "noreferrer";
      line.append(link);
    }
    header.append(line);
  }
  content.append(header);
}

function appendItem(section: HTMLElement, sourceItem: ResumeSectionItem): void {
  const article = element("article", "resume-document-item");
  article.dataset.itemId = sourceItem.id;
  const primaryLine = element("div", "resume-document-entry-line");
  primaryLine.append(
    element("span", "resume-document-entry-primary", entryPrimary(sourceItem)),
  );
  const dates = dateRange(sourceItem);
  if (dates) {
    primaryLine.append(element("span", "resume-document-entry-side", dates));
  }
  article.append(primaryLine);
  const location = splitOrganizationLocation(sourceItem).location;
  if (sourceItem.role || location) {
    const secondaryLine = element(
      "div",
      "resume-document-entry-line resume-document-entry-subline",
    );
    if (sourceItem.role) {
      secondaryLine.append(
        element("span", "resume-document-entry-secondary", sourceItem.role),
      );
    }
    if (location) {
      secondaryLine.append(
        element("span", "resume-document-entry-side", location),
      );
    }
    article.append(secondaryLine);
  }
  if (sourceItem.raw_text) {
    const rawText = element("div", "resume-document-richtext");
    setSafeInlineMarkdown(rawText, sourceItem.raw_text);
    article.append(rawText);
  }
  if (sourceItem.bullets.length) {
    const bullets = element("div", "resume-document-bullets");
    for (const sourceBullet of sourceItem.bullets) {
      const bullet = element("div", "resume-document-bullet");
      bullet.dataset.bulletId = sourceBullet.id;
      const text = element(
        "div",
        "resume-document-richtext resume-document-bullet-text",
      );
      setSafeInlineMarkdown(text, sourceBullet.text);
      bullet.append(
        element("span", "resume-document-bullet-marker", "•"),
        text,
      );
      bullets.append(bullet);
    }
    article.append(bullets);
  }
  section.append(article);
}

export function renderResume(
  root: HTMLElement,
  structure: ResumeStructure,
  template: ResumeTemplateManifestEntry,
): HTMLElement {
  root.replaceChildren();
  const frame = element("div", "resume-document-frame");
  frame.dataset.resumeRenderer = "resume-document-v1";
  frame.dataset.templateId = template.template_id;
  frame.dataset.profileVersion = template.profile_version;
  frame.dataset.profileHash = template.profile_hash;
  applyResumeTemplateStyle(frame, template, structure.layout_tuning);

  const page = element("div", "resume-document-page");
  page.dataset.templateId = template.template_id;
  page.dataset.profileVersion = template.profile_version;
  page.dataset.profileHash = template.profile_hash;
  const box = element("div", "resume-document-content-box");
  const content = element("div", "resume-document-content");
  appendHeader(content, structure);

  for (const sourceSection of sortSections(structure.sections)) {
    if (!sourceSection.heading && !sourceSection.items.length) continue;
    const section = element("section", "resume-document-section");
    section.dataset.sectionId = sourceSection.id;
    section.dataset.sectionType = sourceSection.type;
    section.append(
      element(
        "div",
        "resume-document-section-heading",
        sourceSection.heading || SECTION_LABELS[sourceSection.type] || "Additional",
      ),
    );
    for (const sourceItem of sourceSection.items) appendItem(section, sourceItem);
    content.append(section);
  }
  box.append(content);
  page.append(box);
  frame.append(page);
  root.append(frame);
  return page;
}
