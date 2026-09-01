/**
 * 用坐标信息把 PDF 页面文本重建为阅读顺序：
 * - 按 y 聚类成行、行内按 x 排序（pdfjs 的 getTextContent 不保证顺序）
 * - 检测并排栏（双栏简历），先左栏后右栏输出，避免左右交错
 * - hasEOL 保留行内换行
 *
 * 输入结构刻意用宽松类型，兼容 pdfjs TextContent 与测试构造数据。
 */

export interface PdfTextItemLike {
  str?: unknown;
  hasEOL?: unknown;
  transform?: unknown;
  width?: unknown;
  height?: unknown;
  [key: string]: unknown;
}

interface Span {
  str: string;
  hasEOL: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function extractLayoutText(textContent: {
  items: PdfTextItemLike[];
}): string {
  const spans: Span[] = [];
  for (const item of textContent.items) {
    const str = item.str;
    if (typeof str !== "string" || str.length === 0) continue;
    const transform = Array.isArray(item.transform) ? item.transform : [];
    spans.push({
      str,
      hasEOL: item.hasEOL === true,
      x: toNumber(transform[4]),
      y: toNumber(transform[5]),
      width: toNumber(item.width),
      height: toNumber(item.height),
    });
  }
  if (spans.length === 0) return "";

  return splitColumns(spans)
    .map(renderColumn)
    .filter((column) => column.length > 0)
    .join("\n\n");
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * 按中心 x 聚类成并排栏。只有出现两个以上「主要」区间且区间间
 * 空隙明显时才拆栏，避免把页眉两侧的零星元素（每侧一两个字）误判为栏。
 */
function splitColumns(spans: Span[]): Span[][] {
  const sorted = [...spans].sort(
    (left, right) => centerX(left) - centerX(right),
  );
  const gapThreshold = Math.max(
    median(sorted.map((span) => span.width)) * 2,
    6,
  );
  const clusters: { minCx: number; maxCx: number; spans: Span[] }[] = [];
  for (const span of sorted) {
    const cx = centerX(span);
    const last = clusters[clusters.length - 1];
    if (last && cx <= last.maxCx + gapThreshold) {
      last.maxCx = Math.max(last.maxCx, cx);
      last.spans.push(span);
    } else {
      clusters.push({ minCx: cx, maxCx: cx, spans: [span] });
    }
  }
  if (clusters.length <= 1) return [spans];

  const major = clusters.filter(
    (cluster) =>
      cluster.spans.length >=
      Math.max(2, Math.ceil(spans.length * 0.08)),
  );
  if (major.length < 2) return [spans];
  const left = major[0]!;
  const right = major[1]!;
  const gap = right.minCx - left.maxCx;
  const occupiedWidth = left.maxCx - left.minCx + (right.maxCx - right.minCx);
  if (gap < occupiedWidth * 0.08) return [spans];
  return major.map((cluster) => cluster.spans);
}

function renderColumn(spans: Span[]): string {
  const rows = clusterRows(spans);
  return rows
    .map((row) => {
      let line = row[0]!.str;
      for (let index = 1; index < row.length; index += 1) {
        line += (row[index - 1]!.hasEOL ? "\n" : " ") + row[index]!.str;
      }
      return line;
    })
    .join("\n");
}

/**
 * 按 y 贪心聚类成行（容差取行内最大字高的一半），行内按 x 排序。
 * 贪心基于 y 排序后的序列，pdfjs 同视觉行 span 的 y 差通常在 1pt 以内。
 */
function clusterRows(spans: Span[]): Span[][] {
  const sorted = [...spans].sort((left, right) => right.y - left.y);
  const rows: Span[][] = [];
  let current: Span[] | undefined;
  let baseY = 0;
  let maxHeight = 0;
  for (const span of sorted) {
    if (
      current &&
      Math.abs(span.y - baseY) <= Math.max(maxHeight * 0.5, 2)
    ) {
      current.push(span);
      maxHeight = Math.max(maxHeight, span.height);
    } else {
      current = [span];
      rows.push(current);
      baseY = span.y;
      maxHeight = span.height;
    }
  }
  for (const row of rows) {
    row.sort((left, right) => left.x - right.x);
  }
  return rows;
}

function centerX(span: Span): number {
  return span.x + span.width / 2;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}
