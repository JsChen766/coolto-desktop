import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const A4_WIDTH_POINTS = 595.28;
const A4_HEIGHT_POINTS = 841.89;
const PAGE_SIZE_TOLERANCE_POINTS = 1;

export interface ResumePdfPostflightResult {
  valid: boolean;
  pageCount: number;
  widthPoints: number;
  heightPoints: number;
  isA4Portrait: boolean;
  hasTextLayer: boolean;
  extractedText: string;
  embeddedFontNames: string[];
  missingFontNames: string[];
  cjkFontNames: string[];
  latinFontNames: string[];
  hasTimesNewRoman: boolean;
  hasSimSun: boolean;
  violations: string[];
}

interface ResolvedPdfFont {
  name?: string;
  missingFile?: boolean;
}

function unique(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort();
}

export function containsLatinOrDigit(value: string): boolean {
  return /[A-Za-z0-9]/u.test(value);
}

export async function inspectResumePdf(
  input: Uint8Array,
): Promise<ResumePdfPostflightResult> {
  const bytes = new Uint8Array(input);
  const document = await getDocument({ data: bytes }).promise;
  const pageCount = document.numPages;
  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();
  // Resolving the operator list populates commonObjs with the actual PDF font
  // resources. Chromium writes resources into compressed object streams, so a
  // raw `/BaseFont` regex is not reliable for printToPDF output.
  await page.getOperatorList();
  const extractedText = textContent.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const fontByResourceId = new Map<string, ResolvedPdfFont>();
  const cjkFontNames: string[] = [];
  const latinFontNames: string[] = [];
  for (const item of textContent.items) {
    if (!("str" in item) || !item.str) continue;
    let font = fontByResourceId.get(item.fontName);
    if (!font) {
      font = page.commonObjs.get(item.fontName) as ResolvedPdfFont;
      fontByResourceId.set(item.fontName, font);
    }
    const name = font.name ?? item.fontName;
    if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(item.str)) {
      cjkFontNames.push(name);
    }
    if (containsLatinOrDigit(item.str)) {
      latinFontNames.push(name);
    }
  }
  const missingFontNames = unique(
    Array.from(fontByResourceId.values())
      .filter((font) => font.missingFile)
      .map((font) => font.name ?? "unknown"),
  );
  const embeddedFontNames = unique(
    Array.from(fontByResourceId.values())
      .filter((font) => !font.missingFile)
      .map((font) => font.name ?? "")
      .filter(Boolean),
  );
  const uniqueCjkFontNames = unique(cjkFontNames);
  const uniqueLatinFontNames = unique(latinFontNames);
  const hasTimesNewRoman =
    uniqueLatinFontNames.length > 0 &&
    uniqueLatinFontNames.every((name) =>
      /TimesNewRoman|Times-Roman/i.test(name),
    );
  const hasSimSun =
    uniqueCjkFontNames.length > 0 &&
    uniqueCjkFontNames.every((name) => /SimSun|NSimSun/i.test(name));
  const isA4Portrait =
    Math.abs(viewport.width - A4_WIDTH_POINTS) <= PAGE_SIZE_TOLERANCE_POINTS &&
    Math.abs(viewport.height - A4_HEIGHT_POINTS) <= PAGE_SIZE_TOLERANCE_POINTS;
  const violations: string[] = [];
  if (pageCount !== 1) violations.push("pdf_page_count");
  if (!isA4Portrait) violations.push("pdf_page_size");
  if (!extractedText) violations.push("pdf_text_layer_missing");
  if (missingFontNames.length) violations.push("pdf_font_resource_missing");
  if (uniqueLatinFontNames.length && !hasTimesNewRoman) {
    violations.push("pdf_latin_font_mismatch");
  }
  if (uniqueCjkFontNames.length && !hasSimSun) {
    violations.push("pdf_cjk_font_mismatch");
  }
  document.cleanup();
  return {
    valid: violations.length === 0,
    pageCount,
    widthPoints: viewport.width,
    heightPoints: viewport.height,
    isA4Portrait,
    hasTextLayer: Boolean(extractedText),
    extractedText,
    embeddedFontNames,
    missingFontNames,
    cjkFontNames: uniqueCjkFontNames,
    latinFontNames: uniqueLatinFontNames,
    hasTimesNewRoman,
    hasSimSun,
    violations,
  };
}
