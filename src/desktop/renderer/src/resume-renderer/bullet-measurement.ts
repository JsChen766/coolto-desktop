import {
  RESUME_BULLET_LINE_TOLERANCE_PX,
  type ResumeBulletMeasurement,
  type ResumeCompileViolation,
} from "../../../../resume/compiler-types";

interface VisualLine {
  top: number;
  left: number;
  right: number;
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

export function measureResumeBullets(
  page: HTMLElement,
  gateRatio: number,
): {
  bullets: ResumeBulletMeasurement[];
  violations: ResumeCompileViolation[];
} {
  const bullets: ResumeBulletMeasurement[] = [];
  const violations: ResumeCompileViolation[] = [];
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
    if (
      !Number.isFinite(availableLineWidthPx) ||
      availableLineWidthPx <= 0 ||
      !lines.length
    ) {
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
    const passed = lastLineRatio - Number.EPSILON > gateRatio;
    bullets.push({
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
  return { bullets, violations };
}
