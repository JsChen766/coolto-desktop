import type { ResumePdfPostflightResult } from "../pdf-postflight.js";
import { inspectResumePdf } from "../pdf-postflight.js";
import type { ResumeStructure } from "../types.js";
import { ResumePdfExportError } from "./errors.js";

export async function verifyResumePdfIntegrity(
  pdf: Uint8Array,
  structure: ResumeStructure,
): Promise<ResumePdfPostflightResult> {
  const postflight = await inspectResumePdf(pdf);
  const missingFragments = missingPdfTextFragments(
    postflight.extractedText,
    structure,
  );
  if (!postflight.valid || missingFragments.length) {
    const reasons = [
      ...postflight.violations,
      ...missingFragments.map((value) => `pdf_text_missing:${value.slice(0, 30)}`),
    ];
    throw new ResumePdfExportError(
      "resume_pdf_integrity_failed",
      `PDF postflight failed: ${reasons.join(", ")}`,
    );
  }
  return postflight;
}

export function missingPdfTextFragments(
  extractedText: string,
  structure: ResumeStructure,
): string[] {
  const actual = normalizeVisibleText(extractedText);
  return expectedVisibleFragments(structure).filter(
    (fragment) => !actual.includes(normalizeVisibleText(fragment)),
  );
}

function expectedVisibleFragments(structure: ResumeStructure): string[] {
  const fragments: string[] = [];
  const add = (value: string | null | undefined): void => {
    const cleaned = visibleMarkdownText(value ?? "").trim();
    if (cleaned) fragments.push(cleaned);
  };
  add(structure.contact?.name);
  add(structure.contact?.phone);
  add(structure.contact?.email);
  add(structure.contact?.location);
  add(structure.contact?.linkedin);
  add(structure.contact?.github);
  add(structure.contact?.website);
  for (const section of structure.sections) {
    add(section.heading);
    for (const item of section.items) {
      add(item.title);
      add(item.raw_text);
      for (const bullet of item.bullets) add(bullet.text);
    }
  }
  return Array.from(new Set(fragments));
}

function visibleMarkdownText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/<[^>]+>/gu, "")
    .replace(/[*_`~]/gu, "");
}

function normalizeVisibleText(value: string): string {
  return visibleMarkdownText(value)
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .trim();
}
