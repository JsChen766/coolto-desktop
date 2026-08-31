import { extractEvidenceNumbers } from "../evidence-numbers.js";
import { validateTailCandidateText } from "./tail-content-validation.js";
import { findMechanicalTailEnding } from "./semantic-tail-ending.js";
import type { ResumeWorkspace } from "./types.js";

export function validateSemanticTailRewrite(input: {
  workspace: ResumeWorkspace;
  bulletId: string;
  currentText: string;
  revisedText: string;
  otherCandidateTexts: ReadonlyMap<string, string>;
  sourceQuotes: readonly string[];
  evidenceIds: readonly string[];
}): void {
  const revisedText = input.revisedText.trim();
  if (!revisedText) throw new Error("完整改写不能为空");
  if (normalized(revisedText) === normalized(input.currentText)) {
    throw new Error("完整改写不能原样重交 currentText");
  }
  const missingNumbers = extractEvidenceNumbers(input.currentText).filter(
    (value) => !extractEvidenceNumbers(revisedText).includes(value),
  );
  if (missingNumbers.length) {
    throw new Error(`完整改写遗漏原有数字：${missingNumbers.join("、")}`);
  }
  const missingTerms = protectedLatinTerms(input.currentText).filter(
    (term) => !revisedText.toLocaleLowerCase().includes(term),
  );
  if (missingTerms.length) {
    throw new Error(`完整改写遗漏原有专名或工具：${missingTerms.join("、")}`);
  }
  const otherTexts = input.workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets)
  ).filter((bullet) => bullet.id !== input.bulletId).map((bullet) =>
    input.otherCandidateTexts.get(bullet.id) ?? bullet.text
  );
  const repeatedTail = findMechanicalTailEnding({
    text: revisedText,
    currentText: input.currentText,
    otherTexts,
    sourceQuotes: input.sourceQuotes,
  });
  if (repeatedTail) {
    throw new Error(`完整改写包含机械重复结尾：${repeatedTail}`);
  }
  validateTailCandidateText(
    input.workspace,
    input.bulletId,
    revisedText,
    input.otherCandidateTexts,
    input.evidenceIds,
  );
}

function protectedLatinTerms(value: string): string[] {
  return [...new Set(
    (value.match(/[A-Za-z][A-Za-z0-9.+#/-]{1,}/gu) ?? [])
      .map((term) => term.toLocaleLowerCase()),
  )];
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
