import type {
  ResumeSection,
  ResumeSectionItem,
  ResumeStructure,
} from "../../../../resume/types";
import {
  applyResumeTemplateStyle,
  type ResumeTemplateManifestEntry,
} from "./template";
import { setSafeInlineMarkdown } from "./safe-markdown";
import {
  orderResumeSections,
  presentResumeContacts,
  presentResumeItem,
} from "./section-presenter";

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

function appendHeader(content: HTMLElement, structure: ResumeStructure): void {
  const contact = structure.contact;
  const contacts = presentResumeContacts(contact);
  const hasContact = contacts.length > 0;
  if (!contact?.name && !hasContact) return;
  const header = element("header", "resume-document-header");
  if (contact?.name) {
    header.append(element("span", "resume-document-name", contact.name));
  }
  if (hasContact) {
    const line = element("div", "resume-document-contact");
    for (const value of contacts) {
      if (!value.href) {
        line.append(element("span", undefined, value.text));
        continue;
      }
      const link = element("a", "resume-document-link", value.text);
      link.href = value.href;
      link.target = "_blank";
      link.rel = "noreferrer";
      line.append(link);
    }
    header.append(line);
  }
  content.append(header);
}

function appendItem(
  section: HTMLElement,
  sourceItem: ResumeSectionItem,
  sectionType: ResumeSection["type"],
  language: string,
): void {
  const article = element("article", "resume-document-item");
  article.dataset.itemId = sourceItem.id;
  const presentation = presentResumeItem(
    sourceItem,
    sectionType,
    language,
  );
  const primaryLine = element("div", "resume-document-entry-line");
  primaryLine.append(
    element("span", presentation.primary.primaryClass, presentation.primary.primary),
  );
  if (presentation.primary.side) {
    primaryLine.append(element("span", "resume-document-entry-side", presentation.primary.side));
  }
  article.append(primaryLine);
  if (presentation.secondary) {
    const secondaryLine = element(
      "div",
      "resume-document-entry-line resume-document-entry-subline",
    );
    if (presentation.secondary.primary) {
      secondaryLine.append(
        element(
          "span",
          presentation.secondary.primaryClass,
          presentation.secondary.primary,
        ),
      );
    }
    if (presentation.secondary.side) {
      secondaryLine.append(
        element("span", "resume-document-entry-side", presentation.secondary.side),
      );
    }
    article.append(secondaryLine);
  }
  if (presentation.tertiary) {
    const tertiaryLine = element(
      "div",
      "resume-document-entry-line resume-document-entry-subline",
    );
    tertiaryLine.append(
      element(
        "span",
        presentation.tertiary.primaryClass,
        presentation.tertiary.primary,
      ),
    );
    article.append(tertiaryLine);
  }
  if (sourceItem.raw_text && sectionType !== "education") {
    if (sectionType === "other" || sectionType === "skills") {
      throw new Error("Additional resume content requires evidence-bound bullets.");
    }
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

  for (const sourceSection of orderResumeSections(structure.sections)) {
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
    for (const sourceItem of sourceSection.items) {
      appendItem(section, sourceItem, sourceSection.type, structure.language);
    }
    content.append(section);
  }
  box.append(content);
  page.append(box);
  frame.append(page);
  root.append(frame);
  return page;
}
