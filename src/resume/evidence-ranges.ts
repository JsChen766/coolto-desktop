const MAX_EVIDENCE_SEGMENT_CHARS = 180;
const MIN_CLAUSE_SPLIT_CHARS = 60;

export interface EvidenceRange {
  start: number;
  end: number;
  text: string;
}

/** Structural source segmentation only; no JD relevance is inferred here. */
export function splitEvidenceRanges(content: string): EvidenceRange[] {
  const ranges: EvidenceRange[] = [];
  let segmentStart = 0;
  const flush = (endExclusive: number) => {
    const raw = content.slice(segmentStart, endExclusive);
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    const start = segmentStart + leading;
    const end = endExclusive - trailing;
    if (end - start < 4) return;
    ranges.push(...splitOversizedEvidence(content, start, end));
  };
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    const decimalPoint =
      character === "." && isDigit(content[index - 1]) &&
      isDigit(content[index + 1]);
    if (
      character !== "\n" && !/[。！？!?]/u.test(character) &&
      (character !== "." || decimalPoint)
    ) continue;
    flush(character === "\n" ? index : index + 1);
    segmentStart = index + 1;
  }
  flush(content.length);
  return ranges;
}

function splitOversizedEvidence(
  content: string,
  start: number,
  end: number,
): EvidenceRange[] {
  if (end - start <= MAX_EVIDENCE_SEGMENT_CHARS) {
    return [{ start, end, text: content.slice(start, end) }];
  }
  const ranges: EvidenceRange[] = [];
  let chunkStart = start;
  while (end - chunkStart > MAX_EVIDENCE_SEGMENT_CHARS) {
    const searchEnd = Math.min(
      chunkStart + MAX_EVIDENCE_SEGMENT_CHARS,
      end - MIN_CLAUSE_SPLIT_CHARS,
    );
    let splitAt = searchEnd;
    for (let index = searchEnd - 1;
      index >= chunkStart + MIN_CLAUSE_SPLIT_CHARS; index -= 1) {
      if (/[,，;；\s]/u.test(content[index]!)) {
        splitAt = index + 1;
        break;
      }
    }
    ranges.push(trimmedRange(content, chunkStart, splitAt));
    chunkStart = splitAt;
  }
  if (end - chunkStart >= 4) ranges.push(trimmedRange(content, chunkStart, end));
  return ranges.filter((range) => range.end - range.start >= 4);
}

function trimmedRange(
  content: string,
  start: number,
  end: number,
): EvidenceRange {
  const raw = content.slice(start, end);
  const trimmedStart = start + raw.length - raw.trimStart().length;
  const trimmedEnd = end - (raw.length - raw.trimEnd().length);
  return {
    start: trimmedStart,
    end: trimmedEnd,
    text: content.slice(trimmedStart, trimmedEnd),
  };
}

function isDigit(value: string | undefined): boolean {
  return value !== undefined && value >= "0" && value <= "9";
}
