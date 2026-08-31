import { findResumePaddingIssue } from "../planning/text-padding.js";
import { minimumResumeBulletCount } from "./bullet-count-rules.js";
import { matchingFactNeutralFragment } from "./fact-neutral-fragments.js";
import { validateFactNeutralFragment } from "./fact-neutral-validation.js";
import type { ResumeGenerationBlocker } from
  "./generation-readiness-types.js";
import { observedWorkspaceItemLines } from "./item-line-budget.js";
import type { ResumeWorkspace } from "./types.js";

export function itemReadinessBlockers(
  workspace: ResumeWorkspace,
): ResumeGenerationBlocker[] {
  const blockers: ResumeGenerationBlocker[] = [];
  const hasCurrentProvenance = workspace.bulletProvenance !== undefined;
  const provenance = new Map(
    (workspace.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  const bindings = new Set(
    workspace.bindings.map((entry) => entry.bulletId),
  );
  const supplementalIds = new Set(
    (workspace.supplementalEvidence ?? []).map((entry) => entry.evidenceId),
  );
  const observedLines = observedWorkspaceItemLines(workspace);
  for (const section of workspace.structure.sections) {
    for (const item of section.items) {
      const tier = workspace.itemTiers?.[item.id];
      if (!["education", "skills"].includes(section.type) && !tier) {
        blockers.push({ code: "item_tier_missing",
          message: "经历缺少 main/secondary 匹配度分级", itemId: item.id });
      }
      const budget = workspace.itemLineBudgets?.[item.id];
      if (workspace.lineBudgetVersion === "item-lines-v1" && budget) {
        if (tier && budget.tier !== tier) {
          blockers.push({ code: "item_line_allocation_stale",
            message: "经历相关度或来源已变化，需要重新计算正文行数预算",
            itemId: item.id });
        } else if (!item.bullets.length) {
          blockers.push({ code: "item_empty",
            message: "被选中的经历至少需要一个有证据支持的独立工作单元",
            itemId: item.id });
        } else if (!workspace.compileResult.qualified &&
          (observedLines[item.id] ?? 0) < budget.minimumLines) {
          blockers.push({ code: "item_line_budget_shortfall",
            message: `${tier ?? budget.tier} 经历当前正文行数低于相关度预算`,
            itemId: item.id });
        }
      } else {
        const minimum = minimumResumeBulletCount({
          sectionType: section.type, itemId: item.id, ...(tier ? { tier } : {}),
        });
        if (item.bullets.length < minimum) blockers.push({
          code: "bullet_count_too_low",
          message: `${tier ?? section.type} 内容至少需要 ${minimum} 条 bullet`,
          itemId: item.id,
        });
      }
      for (const bullet of item.bullets) {
        blockers.push(...bulletBlockers({ workspace, itemId: item.id,
          bulletId: bullet.id, text: bullet.text, hasCurrentProvenance,
          provenance, bindings, supplementalIds }));
      }
    }
  }
  return blockers;
}

function bulletBlockers(input: {
  workspace: ResumeWorkspace;
  itemId: string;
  bulletId: string;
  text: string;
  hasCurrentProvenance: boolean;
  provenance: Map<string, NonNullable<ResumeWorkspace["bulletProvenance"]>[number]>;
  bindings: Set<string>;
  supplementalIds: Set<string>;
}): ResumeGenerationBlocker[] {
  const result: ResumeGenerationBlocker[] = [];
  const neutral = matchingFactNeutralFragment(
    input.workspace, input.bulletId, input.text,
  );
  const padding = findResumePaddingIssue(neutral?.baseText ?? input.text);
  if (padding) result.push({ code: "bullet_content_padding",
    message: `bullet 包含${padding}，必须改写为具体动作、对象、方法或结果`,
    itemId: input.itemId, bulletId: input.bulletId });
  if (neutral) {
    try {
      validateFactNeutralFragment(
        neutral.fragmentText, input.workspace.structure.language,
      );
    } catch (error: unknown) {
      result.push({ code: "bullet_content_padding",
        message: error instanceof Error ? error.message : String(error),
        itemId: input.itemId, bulletId: input.bulletId });
    }
  }
  const source = input.provenance.get(input.bulletId);
  if (!source && input.hasCurrentProvenance) result.push({
    code: "bullet_provenance_missing", message: "bullet 缺少来源记录",
    itemId: input.itemId, bulletId: input.bulletId,
  });
  else if (!source && !input.bindings.has(input.bulletId)) result.push({
    code: "grounded_evidence_missing", message: "旧版事实型 bullet 缺少可验证证据",
    itemId: input.itemId, bulletId: input.bulletId,
  });
  else if (source?.origin === "grounded" && (!source.evidenceIds.length ||
    (source.evidenceIds.some((id) => !input.supplementalIds.has(id)) &&
      !input.bindings.has(input.bulletId)))) result.push({
    code: "grounded_evidence_missing", message: "事实型 bullet 缺少可验证证据",
    itemId: input.itemId, bulletId: input.bulletId,
  });
  else if (source?.origin === "agent_augmented" &&
    source.confirmation !== "confirmed") result.push({
    code: "augmented_confirmation_pending", message: "AI 补写内容尚未得到用户确认",
    itemId: input.itemId, bulletId: input.bulletId,
  });
  if (hasSentencePunctuation(input.text)) result.push({
    code: "sentence_punctuation", message: "bullet 末尾不得有句末标点",
    itemId: input.itemId, bulletId: input.bulletId,
  });
  return result;
}

function hasSentencePunctuation(value: string): boolean {
  return new Set(["。", ".", "！", "!", "？", "?", "；", ";", "：", ":"])
    .has(value.trim().at(-1) ?? "");
}
