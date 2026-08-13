/**
 * Rejects generated text that repeats a fragment of >= minWindow characters
 * (default 8). The writer sometimes stutters on long bullets; duplication
 * would look broken in the final resume, so it is treated as a rewrite-worthy
 * failure. Cross-bullet comparisons use a longer window (12): bullets written
 * by the same model naturally share short closing phrases, and only longer
 * shared wording signals a near-duplicate.
 */
export function findRepeatedFragment(
  text: string,
  minWindow = 10,
): string | null {
  const chars = [...text];
  for (let window = Math.max(minWindow, 16); window >= minWindow; window -= 1) {
    const seen = new Set<string>();
    for (let index = 0; index + window <= chars.length; index += 1) {
      const fragment = chars.slice(index, index + window).join("");
      if (seen.has(fragment)) return fragment;
      seen.add(fragment);
    }
  }
  return null;
}

/**
 * Removes verbatim evidence source quotes from a bullet text. Used before
 * cross-bullet repetition checks so two bullets citing different ranges of
 * the same experience never count the shared source sentence as duplicated
 * model wording.
 */
export function stripEvidenceQuotes(
  text: string,
  excerpts: readonly { sourceQuote: string }[],
): string {
  let stripped = text;
  for (const excerpt of excerpts) {
    stripped = stripped.split(excerpt.sourceQuote).join("");
  }
  return stripped;
}
