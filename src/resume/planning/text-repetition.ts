
/**
 * Rejects generated text that repeats a fragment of >= 8 characters. The
 * writer sometimes stutters on long bullets; duplication would look broken
 * in the final resume, so it is treated as a rewrite-worthy failure.
 */
export function findRepeatedFragment(text: string): string | null {
  const chars = [...text];
  for (let window = 16; window >= 8; window -= 1) {
    const seen = new Set<string>();
    for (let index = 0; index + window <= chars.length; index += 1) {
      const fragment = chars.slice(index, index + window).join("");
      if (seen.has(fragment)) return fragment;
      seen.add(fragment);
    }
  }
  return null;
}


