const ALLOWED_ADDED_WORDS = new Set([
  "also", "and", "while", "within", "in", "the", "same", "analysis",
  "context",
]);

export function factEquivalentTailOptions(currentText: string): string[] {
  const boundary = currentText.indexOf("; ");
  if (boundary < 0) return [];
  const before = currentText.slice(0, boundary);
  const after = currentText.slice(boundary + 2);
  return [
    `${before}; also ${after}`,
    `${before}; within the same analysis, ${after}`,
    `${before}; in the same context, ${after}`,
  ];
}

export function validateFactEquivalentTailEdit(
  currentText: string,
  revisedText: string,
): void {
  const current = tokens(currentText);
  const revised = tokens(revisedText);
  let currentIndex = 0;
  for (const token of revised) {
    if (token === current[currentIndex]) {
      currentIndex += 1;
      continue;
    }
    if (!ALLOWED_ADDED_WORDS.has(token)) {
      throw new Error(`事实等价重排加入了非中性词：${token}`);
    }
  }
  if (currentIndex !== current.length) {
    throw new Error("事实等价重排必须保留全部原词及顺序");
  }
}

function tokens(value: string): string[] {
  return (value.normalize("NFKC").toLocaleLowerCase().match(
    /[\p{L}\p{N}]+(?:[.+/#-][\p{L}\p{N}]+)*/gu,
  ) ?? []);
}
