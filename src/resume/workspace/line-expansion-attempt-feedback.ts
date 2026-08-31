import type { PageFillExpansionInput } from "./page-fill-expansion-input.js";
import type { LineRewriteDiagnostics } from "./line-rewrite-selector.js";

/** Keeps only rejected compact insertions; successful attempts are superseded by currentText. */
export function attachRejectedLineExpansionAttempts(
  diagnostics: LineRewriteDiagnostics,
  inputs: readonly PageFillExpansionInput[] | undefined,
): LineRewriteDiagnostics {
  if (!inputs?.length) return diagnostics;
  const insertionByBullet = new Map(
    inputs.map((input) => [input.bulletId, input.insertText.trim()]),
  );
  return {
    ...diagnostics,
    feedback: diagnostics.feedback.map((entry) => {
      const insertText = insertionByBullet.get(entry.bulletId);
      return entry.status === "rejected" && insertText
        ? { ...entry, rejectedInsertText: insertText }
        : entry;
    }),
  };
}
