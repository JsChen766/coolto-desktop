export function concreteExpansionHints(
  sourceQuotes: readonly string[],
  currentText: string,
): string[] {
  const current = compact(currentText);
  const candidates = [...new Set(sourceQuotes.flatMap((quote) =>
    quote.split(/[\r\n。；;，,]+/u).map((part) => part.trim())
  ).filter((part) => {
    const candidate = compact(part);
    return candidate.length >= 4 && candidate.length <= 120 &&
      !current.includes(candidate);
  }))];
  return candidates.sort((left, right) =>
    unseenCharacters(right, current) - unseenCharacters(left, current) ||
    right.length - left.length
  ).slice(0, 4);
}

function compact(value: string): string {
  return value.normalize("NFKC").replace(/[^\p{L}\p{N}%]+/gu, "");
}

function unseenCharacters(candidate: string, current: string): number {
  return [...new Set(candidate)].filter((character) =>
    !current.includes(character)
  ).length;
}
