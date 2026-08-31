import { RESUME_BULLET_LINE_TOLERANCE_PX } from
  "../../../../resume/compiler-types";

export interface VisualLine {
  top: number;
  left: number;
  right: number;
}

function finiteRect(rect: DOMRect): boolean {
  return [rect.top, rect.left, rect.right, rect.bottom, rect.width, rect.height]
    .every(Number.isFinite);
}

export function textRects(target: HTMLElement): DOMRect[] {
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const rectangles: DOMRect[] = [];
  let node = walker.nextNode();
  while (node) {
    if ((node.textContent ?? "").trim()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      rectangles.push(...Array.from(range.getClientRects()).filter(
        (rect) => finiteRect(rect) && rect.width > 0 && rect.height > 0,
      ));
      range.detach();
    }
    node = walker.nextNode();
  }
  return rectangles;
}

export function measureVisualLines(target: HTMLElement): VisualLine[] {
  const rectangles = textRects(target).sort(
    (left, right) => left.top - right.top || left.left - right.left,
  );
  const lines: VisualLine[] = [];
  for (const rectangle of rectangles) {
    const line = lines.find((candidate) =>
      Math.abs(candidate.top - rectangle.top) <=
        RESUME_BULLET_LINE_TOLERANCE_PX
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
