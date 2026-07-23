import {
  RESUME_BULLET_LINE_TOLERANCE_PX,
  RESUME_LAYOUT_TOLERANCE_PX,
  type ResumeBulletMeasurement,
  type ResumeCompileResult,
  type ResumeCompileViolation,
} from "../../../../resume/compiler-types";
import type {
  ResumeSection,
  ResumeSectionItem,
  ResumeStructure,
} from "../../../../resume/types";
import {
  applyResumeTemplateStyle,
  effectiveTargetBand,
  requireResumeTemplate,
  resolveResumeTemplate,
  type ResumeTemplateManifestEntry,
} from "./template";

const SECTION_ORDER: Readonly<Record<string, number>> = {
  education: 0,
  experience: 1,
  project: 2,
  other: 3,
  skill: 4,
  skills: 4,
};

interface VisualLine {
  top: number;
  left: number;
  right: number;
}

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

function renderResume(
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
  const contact = structure.contact;
  const hasContact = Boolean(
    contact?.phone || contact?.email || contact?.location || contact?.linkedin,
  );
  if (contact?.name || hasContact) {
    const header = element("header", "resume-document-header");
    if (contact?.name) {
      header.append(element("span", "resume-document-name", contact.name));
    }
    if (hasContact) {
      const contactLine = element("div", "resume-document-contact");
      for (const value of [
        contact?.phone,
        contact?.email,
        contact?.location,
        contact?.linkedin,
      ]) {
        if (value) contactLine.append(element("span", undefined, value));
      }
      header.append(contactLine);
    }
    content.append(header);
  }

  for (const sourceSection of sortSections(structure.sections)) {
    if (!sourceSection.heading && !sourceSection.items.length) continue;
    const section = element("section", "resume-document-section");
    section.dataset.sectionId = sourceSection.id;
    section.dataset.sectionType = sourceSection.type;
    section.append(
      element(
        "div",
        "resume-document-section-heading",
        sourceSection.heading || "Additional",
      ),
    );
    for (const sourceItem of sourceSection.items) {
      const article = element("article", "resume-document-item");
      article.dataset.itemId = sourceItem.id;
      const primaryLine = element("div", "resume-document-entry-line");
      primaryLine.append(
        element("span", "resume-document-entry-primary", entryPrimary(sourceItem)),
      );
      const dates = dateRange(sourceItem);
      if (dates) {
        primaryLine.append(
          element("span", "resume-document-entry-side", dates),
        );
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
            element(
              "span",
              "resume-document-entry-secondary",
              sourceItem.role,
            ),
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
        article.append(
          element(
            "div",
            "resume-document-richtext",
            sourceItem.raw_text,
          ),
        );
      }
      if (sourceItem.bullets.length) {
        const bullets = element("div", "resume-document-bullets");
        for (const sourceBullet of sourceItem.bullets) {
          const bullet = element("div", "resume-document-bullet");
          bullet.dataset.bulletId = sourceBullet.id;
          bullet.append(
            element("span", "resume-document-bullet-marker", "•"),
            element(
              "div",
              "resume-document-richtext resume-document-bullet-text",
              sourceBullet.text,
            ),
          );
          bullets.append(bullet);
        }
        article.append(bullets);
      }
      section.append(article);
    }
    content.append(section);
  }
  box.append(content);
  page.append(box);
  frame.append(page);
  root.append(frame);
  return page;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForFonts(
  page: HTMLElement,
  template: ResumeTemplateManifestEntry,
): Promise<{ ready: boolean; loadedFamilies: string[] }> {
  await document.fonts.ready;
  const text = page.textContent ?? "";
  const scripts = [
    {
      family: template.fonts.chinese.family,
      sample: "中文简历",
      used: /[\u3400-\u9fff\uf900-\ufaff]/u.test(text),
    },
    {
      family: template.fonts.english.family,
      sample: "English resume 2026",
      used: /[A-Za-z0-9]/u.test(text),
    },
  ].filter((script) => script.used);
  if (!scripts.length) {
    scripts.push({
      family: template.fonts.english.family,
      sample: "English resume 2026",
      used: true,
    });
  }
  const styles = Array.from(
    new Set([
      `${template.styles.body.font_weight} ${template.styles.body.font_size_pt}pt`,
      `${template.styles.name.font_weight} ${template.styles.name.font_size_pt}pt`,
      `${template.styles.section_heading.font_weight} ${template.styles.section_heading.font_size_pt}pt`,
    ]),
  );
  const requests = styles.flatMap((style) =>
    scripts.map((script) => ({
      specification: `${style} "${script.family}"`,
      sample: script.sample,
    })),
  );
  await Promise.all(
    requests.map((request) =>
      document.fonts.load(request.specification, request.sample),
    ),
  );
  const ready = requests.every((request) =>
    document.fonts.check(request.specification, request.sample),
  );
  return {
    ready,
    loadedFamilies: ready ? scripts.map((script) => script.family) : [],
  };
}

function finiteRect(rect: DOMRect): boolean {
  return [
    rect.top,
    rect.left,
    rect.right,
    rect.bottom,
    rect.width,
    rect.height,
  ].every(Number.isFinite);
}

function textRects(target: HTMLElement): DOMRect[] {
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const rectangles: DOMRect[] = [];
  let node = walker.nextNode();
  while (node) {
    if ((node.textContent ?? "").trim()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      rectangles.push(
        ...Array.from(range.getClientRects()).filter(
          (rect) => finiteRect(rect) && rect.width > 0 && rect.height > 0,
        ),
      );
      range.detach();
    }
    node = walker.nextNode();
  }
  return rectangles;
}

function groupRectsIntoVisualLines(rectangles: DOMRect[]): VisualLine[] {
  const sorted = [...rectangles].sort(
    (left, right) => left.top - right.top || left.left - right.left,
  );
  const lines: VisualLine[] = [];
  for (const rectangle of sorted) {
    const line = lines.find(
      (candidate) =>
        Math.abs(candidate.top - rectangle.top) <=
        RESUME_BULLET_LINE_TOLERANCE_PX,
    );
    if (line) {
      line.left = Math.min(line.left, rectangle.left);
      line.right = Math.max(line.right, rectangle.right);
    } else {
      lines.push({
        top: rectangle.top,
        left: rectangle.left,
        right: rectangle.right,
      });
    }
  }
  return lines.sort((left, right) => left.top - right.top);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function measureBullets(
  page: HTMLElement,
  gateRatio: number,
  violations: ResumeCompileViolation[],
): ResumeBulletMeasurement[] {
  const results: ResumeBulletMeasurement[] = [];
  const seen = new Set<string>();
  for (const bullet of Array.from(
    page.querySelectorAll<HTMLElement>("[data-bullet-id]"),
  )) {
    const bulletId = (bullet.dataset.bulletId ?? "").trim();
    if (!bulletId) {
      violations.push({
        code: "missing_bullet_id",
        message: "A rendered bullet is missing its stable ID.",
      });
      continue;
    }
    if (seen.has(bulletId)) {
      violations.push({
        code: "duplicate_bullet_id",
        message: `Duplicate bullet ID: ${bulletId}`,
        bulletId,
      });
      continue;
    }
    seen.add(bulletId);
    const text = bullet.querySelector<HTMLElement>(
      ".resume-document-bullet-text",
    );
    if (!text || !(text.textContent ?? "").trim()) {
      violations.push({
        code: "empty_bullet",
        message: `Bullet ${bulletId} has no visible text.`,
        bulletId,
      });
      continue;
    }
    const style = getComputedStyle(text);
    const horizontalPadding =
      Number.parseFloat(style.paddingLeft || "0") +
      Number.parseFloat(style.paddingRight || "0");
    const availableLineWidthPx = text.clientWidth - horizontalPadding;
    const lines = groupRectsIntoVisualLines(textRects(text));
    if (!Number.isFinite(availableLineWidthPx) || availableLineWidthPx <= 0 || !lines.length) {
      violations.push({
        code: "invalid_bullet_geometry",
        message: `Bullet ${bulletId} has invalid DOM geometry.`,
        bulletId,
      });
      continue;
    }
    const lastLine = lines.at(-1);
    if (!lastLine) continue;
    const lastLineWidthPx = lastLine.right - lastLine.left;
    const lastLineRatio = lastLineWidthPx / availableLineWidthPx;
    const passed = lastLineRatio + Number.EPSILON >= gateRatio;
    results.push({
      bulletId,
      lineCount: lines.length,
      lastLineWidthPx: round(lastLineWidthPx),
      availableLineWidthPx: round(availableLineWidthPx),
      lastLineRatio: round(lastLineRatio),
      passed,
    });
    if (!passed) {
      violations.push({
        code: "bullet_tail_too_short",
        message: `Bullet ${bulletId} last line uses ${(lastLineRatio * 100).toFixed(1)}% of the available width.`,
        bulletId,
      });
    }
  }
  return results;
}

function lastMeaningfulBottom(content: HTMLElement, contentTop: number): number {
  const bottoms = Array.from(content.children)
    .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)
    .filter(
      (candidate) =>
        (candidate.textContent ?? "").trim() ||
        candidate.querySelector("img,svg,canvas"),
    )
    .map((candidate) => candidate.getBoundingClientRect().bottom - contentTop)
    .filter((value) => Number.isFinite(value) && value >= 0);
  return bottoms.length ? Math.max(...bottoms) : 0;
}

export async function compileResume(
  root: HTMLElement,
  structure: ResumeStructure,
  fixtureId?: string,
): Promise<ResumeCompileResult> {
  const fallbackTemplate = requireResumeTemplate("resume-standard");
  const template = resolveResumeTemplate(structure);
  const selectedTemplate = template ?? fallbackTemplate;
  const targetBand = effectiveTargetBand(
    selectedTemplate,
    structure.layout_target_band,
  );
  const violations: ResumeCompileViolation[] = [];
  if (!template) {
    violations.push({
      code: "profile_mismatch",
      message: "Resume template profile/version/hash does not match the App manifest.",
    });
  }
  const page = renderResume(root, structure, selectedTemplate);
  await nextFrame();
  let fontsReady = false;
  let loadedFontFamilies: string[] = [];
  try {
    const fontResult = await waitForFonts(page, selectedTemplate);
    fontsReady = fontResult.ready;
    loadedFontFamilies = fontResult.loadedFamilies;
  } catch {
    fontsReady = false;
  }
  if (!fontsReady) {
    violations.push({
      code: "font_unavailable",
      message: "Required resume fonts were not loaded by Chromium.",
    });
  }
  await nextFrame();
  await nextFrame();
  const box = page.querySelector<HTMLElement>(
    ".resume-document-content-box",
  );
  const content = page.querySelector<HTMLElement>(
    ".resume-document-content",
  );
  let pageCount = 1;
  let overflowPx = 0;
  let usedHeightPx = 0;
  let availableHeightPx = 0;
  let usageRatio = 0;
  if (!box || !content) {
    violations.push({
      code: "missing_measurement_nodes",
      message: "Resume measurement nodes are missing.",
    });
  } else {
    availableHeightPx = box.clientHeight;
    const contentTop = box.getBoundingClientRect().top;
    usedHeightPx = lastMeaningfulBottom(content, contentTop);
    const scrollHeight = box.scrollHeight;
    overflowPx = Math.max(0, scrollHeight - availableHeightPx);
    pageCount = Math.max(
      1,
      Math.ceil(
        Math.max(0, scrollHeight - RESUME_LAYOUT_TOLERANCE_PX) /
          Math.max(1, availableHeightPx),
      ),
    );
    usageRatio = availableHeightPx > 0 ? usedHeightPx / availableHeightPx : 0;
    if (
      ![
        availableHeightPx,
        usedHeightPx,
        scrollHeight,
        overflowPx,
        usageRatio,
      ].every(Number.isFinite) ||
      availableHeightPx <= 0
    ) {
      violations.push({
        code: "invalid_page_geometry",
        message: "Resume page has invalid DOM geometry.",
      });
    }
  }
  if (pageCount > 1) {
    violations.push({
      code: "multiple_pages",
      message: `Resume requires ${pageCount} pages.`,
    });
  }
  if (overflowPx > RESUME_LAYOUT_TOLERANCE_PX) {
    violations.push({
      code: "page_overflow",
      message: `Resume overflows the A4 content box by ${overflowPx.toFixed(1)}px.`,
    });
  }
  if (usageRatio < targetBand.minimum) {
    violations.push({
      code: "page_underfilled",
      message: `Resume uses ${(usageRatio * 100).toFixed(1)}%; minimum is ${(targetBand.minimum * 100).toFixed(1)}%.`,
    });
  }
  if (usageRatio > targetBand.maximum) {
    violations.push({
      code: "page_overfilled",
      message: `Resume uses ${(usageRatio * 100).toFixed(1)}%; maximum is ${(targetBand.maximum * 100).toFixed(1)}%.`,
    });
  }
  const bullets = measureBullets(
    page,
    selectedTemplate.bullet.gate_ratio,
    violations,
  );
  return {
    ...(fixtureId ? { fixtureId } : {}),
    templateId: selectedTemplate.template_id,
    profileVersion: selectedTemplate.profile_version,
    profileHash: selectedTemplate.profile_hash,
    qualified: violations.length === 0,
    fontsReady,
    loadedFontFamilies,
    pageCount,
    overflowPx: round(overflowPx),
    usedHeightPx: round(usedHeightPx),
    availableHeightPx: round(availableHeightPx),
    usageRatio: round(usageRatio),
    effectiveTargetBand: targetBand,
    bullets,
    violations,
  };
}

