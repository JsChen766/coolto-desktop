const TAIL_WINDOW = 48;
const MIN_SHARED_WINDOW = 12;
const LEGACY_NEUTRAL_ENDING =
  /(?:便于|以便|为便于).{0,42}(?:复核|跟踪|工作脉络|呈现方式)|(?:for|to keep).{0,42}(?:review|tracking|follow-through)$/iu;

/** Returns only newly introduced, source-unsupported mechanical tail wording. */
export function findMechanicalTailEnding(input: {
  text: string;
  currentText: string;
  otherTexts: readonly string[];
  sourceQuotes: readonly string[];
}): string | undefined {
  const tail = normalizedTail(input.text);
  if (!tail || tail === normalizedTail(input.currentText)) return undefined;
  const source = normalize(input.sourceQuotes.join(""));
  const legacyEnding = tail.match(LEGACY_NEUTRAL_ENDING)?.[0];
  if (legacyEnding && !source.includes(legacyEnding)) {
    return legacyEnding;
  }
  for (const otherText of input.otherTexts) {
    const otherTail = normalizedTail(otherText);
    const repeated = longestSharedWindow(tail, otherTail);
    if (repeated && !source.includes(repeated)) return repeated;
  }
  return undefined;
}

function longestSharedWindow(left: string, right: string): string | undefined {
  const leftChars = [...left];
  for (
    let size = Math.min(leftChars.length, [...right].length, 24);
    size >= MIN_SHARED_WINDOW;
    size -= 1
  ) {
    for (let index = 0; index + size <= leftChars.length; index += 1) {
      const fragment = leftChars.slice(index, index + size).join("");
      if (right.includes(fragment)) return fragment;
    }
  }
  return undefined;
}

function normalizedTail(value: string): string {
  return [...normalize(value)].slice(-TAIL_WINDOW).join("");
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase()
    .replace(/[\s，,。.!！?？；;：:]+/gu, "");
}
