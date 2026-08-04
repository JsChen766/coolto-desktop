import { ResumeWorkspaceError } from "./errors.js";
import type { ResumePatchOperationInput } from "./types.js";

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
