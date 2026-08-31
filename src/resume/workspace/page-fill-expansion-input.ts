import { composeTailExpansion } from "./tail-repair-input.js";
import { lineExpansionTargets } from "./line-expansion-targets.js";
import type { LineRewriteInput } from "./line-rewrite-selector.js";
import type { ResumeWorkspace } from "./types.js";

export interface PageFillExpansionInput {
  bulletId: string;
  component: "context" | "method" | "action" | "result";
  placement: "prepend" | "after" | "append";
  anchor?: string;
  insertText: string;
  contentMode?: "fact_neutral";
}

/** Converts one economical component insertion into a measurable page-fill rewrite. */
export function pageFillExpansionRewrites(
  workspace: ResumeWorkspace,
  inputs: readonly PageFillExpansionInput[],
): LineRewriteInput[] {
  const allowed = new Set(
    lineExpansionTargets(workspace).map((target) => target.bulletId),
  );
  const currentTexts = new Map(workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.bullets.map((bullet) => [bullet.id, bullet.text] as const)
    )
  ));
  const seenIds = new Set<string>();
  const seenInsertions = new Set<string>();
  return inputs.map((input) => {
    if (seenIds.has(input.bulletId)) {
      throw new Error(`bullet ${input.bulletId} 在篇幅扩写批次中重复`);
    }
    seenIds.add(input.bulletId);
    if (!allowed.has(input.bulletId)) {
      throw new Error(`bullet ${input.bulletId} 不在 lineExpansionTargets 中`);
    }
    const currentText = currentTexts.get(input.bulletId);
    if (!currentText) throw new Error(`bullet ${input.bulletId} 缺少当前文本`);
    const insertText = input.insertText.trim();
    if (!insertText) throw new Error(`bullet ${input.bulletId} insertText 不能为空`);
    const normalizedInsertion = normalized(insertText);
    if (normalizedInsertion.includes(normalized(currentText))) {
      throw new Error(`bullet ${input.bulletId} 只能提交插入片段，不能重交完整 bullet`);
    }
    if (seenInsertions.has(normalizedInsertion)) {
      throw new Error(`bullet ${input.bulletId} 与本批其他插入片段重复`);
    }
    seenInsertions.add(normalizedInsertion);
    const revisedText = composeTailExpansion(
      currentText,
      { ...input, insertText },
      workspace.structure.language,
    );
    return {
      bulletId: input.bulletId,
      revisedText,
      ...(input.contentMode ? { contentMode: input.contentMode } : {}),
    };
  });
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}
