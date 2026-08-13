import { ResumeWorkspaceError } from "./errors.js";
import type { ResumePatchOperationInput } from "./types.js";

/** Longest prefix of an append that may be absorbed when it already sits at
 * the bullet's tail. Below this length the model clearly intends a fresh
 * sentence (short shared verbs like "负责" must never be stripped). */
const MIN_EDGE_OVERLAP = 10;

/** Leading punctuation between the bullet tail and the resumed sentence
 * ("…支撑" + "，为…支撑与工程保障"). */
const LEADING_PUNCTUATION = /^[\s，。．.、；;：:！!？?（）()\-—…"“”'‘’《》]+/u;

/**
 * Appends whose head already appears at the bullet's tail (the tail pass
 * re-sends whole sentences to extend them) are normalized to their
 * non-overlapping remainder. Returns the effective text to append; the empty
 * string means the append is fully absorbed and the bullet is unchanged.
 */
export function residualAppendText(bullet: string, append: string): string {
  const direct = edgeOverlap(bullet, append);
  if (direct >= MIN_EDGE_OVERLAP) return append.slice(direct);
  const core = append.replace(LEADING_PUNCTUATION, "");
  if (core === append) return append;
  const stripped = edgeOverlap(bullet, core);
  if (stripped >= MIN_EDGE_OVERLAP) return core.slice(stripped);
  return append;
}

/** Longest L such that `text` ends with the first L chars of `candidate`. */
function edgeOverlap(text: string, candidate: string): number {
  const max = Math.min(text.length, candidate.length);
  for (let length = max; length >= 1; length -= 1) {
    if (text.endsWith(candidate.slice(0, length))) return length;
  }
  return 0;
}

/**
 * Applies a single incremental text operation to a bullet's current text.
 * `insert_text` and `replace_substring` anchor on a substring that must appear
 * exactly once in the bullet; the model copies the unique substring verbatim
 * from the workspace visibleText.
 */
export function applyIncrementalText(
  original: string,
  operation: Extract<
    ResumePatchOperationInput,
    { op: "append_text" | "prepend_text" | "insert_text" | "replace_substring" }
  >,
): string {
  if (operation.op === "append_text") return original + operation.text;
  if (operation.op === "prepend_text") return operation.text + original;
  if (operation.op === "insert_text") {
    return original.replace(
      anchorPattern(original, operation.after, "insert_text"),
      (anchor) => anchor + operation.text,
    );
  }
  return original.replace(
    anchorPattern(original, operation.from, "replace_substring"),
    operation.to,
  );
}

function anchorPattern(text: string, anchor: string, opName: string): string {
  let occurrences = 0;
  let position = text.indexOf(anchor);
  while (position >= 0) {
    occurrences += 1;
    position = text.indexOf(anchor, position + 1);
  }
  if (occurrences === 0) {
    throw new ResumeWorkspaceError(
      "bullet_anchor_not_found",
      `${opName} anchor "${anchor}" does not appear in bullet text.`,
    );
  }
  if (occurrences > 1) {
    throw new ResumeWorkspaceError(
      "bullet_anchor_ambiguous",
      `${opName} anchor "${anchor}" appears ${occurrences} times in bullet text; copy a longer unique substring from visibleText.`,
    );
  }
  return anchor;
}
