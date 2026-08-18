const MIN_PATTERN_CHARS = 64;
const MAX_PATTERN_CHARS = 1_024;
const REQUIRED_REPEATS = 4;
const MAX_BUFFER_CHARS = 8_192;
const MAX_NARRATIVE_CHARS = 6_000;

/**
 * Detects a long exact cycle or runaway narration inside one streamed model
 * response. Tool-call argument deltas do not enter this guard, so large batch
 * writes remain allowed while unproductive prose gets a guided retry.
 */
export class StreamingOutputRepetitionGuard {
  #buffer = "";
  #narrativeCharacters = 0;

  public reset(): void {
    this.#buffer = "";
    this.#narrativeCharacters = 0;
  }

  public append(delta: string): boolean {
    if (delta.length === 0) return false;
    this.#narrativeCharacters += [...delta].length;
    if (this.#narrativeCharacters > MAX_NARRATIVE_CHARS) return true;
    this.#buffer = (this.#buffer + delta).slice(-MAX_BUFFER_CHARS);
    return hasRepeatedSuffix(normalize(this.#buffer));
  }
}

function hasRepeatedSuffix(text: string): boolean {
  const maxPattern = Math.min(
    MAX_PATTERN_CHARS,
    Math.floor(text.length / REQUIRED_REPEATS),
  );
  for (let size = MIN_PATTERN_CHARS; size <= maxPattern; size += 1) {
    const unit = text.slice(-size);
    let matches = true;
    for (let repeat = 2; repeat <= REQUIRED_REPEATS; repeat += 1) {
      const end = text.length - size * (repeat - 1);
      if (text.slice(end - size, end) !== unit) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function normalize(text: string): string {
  return text.normalize("NFKC").replace(/\s+/gu, " ");
}
