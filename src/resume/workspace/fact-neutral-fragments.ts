import { validateFactNeutralFragment } from "./fact-neutral-validation.js";
import type { ResumeFactNeutralFragment } from "./fact-neutral-types.js";
import type { ResumeWorkspace } from "./types.js";

export function proposeFactNeutralFragment(input: {
  workspace: ResumeWorkspace;
  bulletId: string;
  appliedText: string;
  purpose: ResumeFactNeutralFragment["purpose"];
}): ResumeFactNeutralFragment {
  if (!input.workspace.factNeutralAuthorization) {
    throw new Error("用户尚未完成岗位场景追问并明确确认没有更多事实，不能加入中性补齐");
  }
  const currentText = currentBulletText(input.workspace, input.bulletId);
  const prior = input.workspace.factNeutralFragments?.find((entry) =>
    entry.bulletId === input.bulletId && entry.appliedText === currentText
  );
  const baseText = prior?.baseText ?? currentText;
  const fragmentText = insertedCharacters(baseText, input.appliedText);
  validateFactNeutralFragment(fragmentText, input.workspace.structure.language);
  return {
    bulletId: input.bulletId,
    baseText,
    fragmentText,
    appliedText: input.appliedText.trim(),
    purpose: input.purpose,
    createdAt: prior?.createdAt ?? new Date().toISOString(),
  };
}

export function withFactNeutralFragments(
  workspace: ResumeWorkspace,
  proposals: readonly ResumeFactNeutralFragment[],
): ResumeWorkspace {
  const proposedIds = new Set(proposals.map((entry) => entry.bulletId));
  return {
    ...workspace,
    factNeutralFragments: [
      ...(workspace.factNeutralFragments ?? []).filter(
        (entry) => !proposedIds.has(entry.bulletId),
      ),
      ...proposals,
    ],
  };
}

export function reconcileFactNeutralFragments(
  workspace: ResumeWorkspace,
  structure: ResumeWorkspace["structure"],
): ResumeFactNeutralFragment[] {
  const texts = new Map(structure.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.bullets.map((bullet) => [bullet.id, bullet.text] as const)
    )
  ));
  return (workspace.factNeutralFragments ?? []).filter((entry) =>
    texts.get(entry.bulletId)?.trim() === entry.appliedText.trim()
  );
}

export function matchingFactNeutralFragment(
  workspace: ResumeWorkspace,
  bulletId: string,
  appliedText: string,
): ResumeFactNeutralFragment | undefined {
  return workspace.factNeutralFragments?.find((entry) =>
    entry.bulletId === bulletId &&
    entry.appliedText.trim() === appliedText.trim()
  );
}

function insertedCharacters(baseText: string, appliedText: string): string {
  const normalizedBase = baseText.normalize("NFKC");
  const normalizedApplied = appliedText.normalize("NFKC");
  if (normalizedApplied.startsWith(normalizedBase)) {
    return cleanInserted(normalizedApplied.slice(normalizedBase.length));
  }
  if (normalizedApplied.endsWith(normalizedBase)) {
    return cleanInserted(normalizedApplied.slice(0, -normalizedBase.length));
  }
  const base = [...normalizedBase];
  const applied = [...normalizedApplied];
  const inserted: string[] = [];
  let index = 0;
  for (const character of applied) {
    if (character === base[index]) index += 1;
    else inserted.push(character);
  }
  if (index !== base.length || applied.length <= base.length) {
    throw new Error("中性补齐必须完整保留原事实文本及字符顺序，只能插入中性表达");
  }
  return cleanInserted(inserted.join(""));
}

function cleanInserted(value: string): string {
  return value.replace(/^[，,；;:\s]+|[，,；;:\s]+$/gu, "");
}

function currentBulletText(workspace: ResumeWorkspace, bulletId: string): string {
  const bullet = workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets),
  ).find((entry) => entry.id === bulletId);
  if (!bullet) throw new Error(`bullet ${bulletId} 不在当前工作区`);
  return bullet.text;
}
