import type { ResumeWorkspace, ResumeWorkspaceStatus } from "./types.js";
import { deriveWorkspaceStatus } from "./workspace-status.js";
import { pendingAugmentedContent } from "./augmentation-state.js";
import { missingCriticalSkillEvidence } from "./critical-skill-gate.js";
import { bulletDepthRewriteTargets } from "./bullet-depth-targets.js";
import { findResumePaddingIssue } from "../planning/text-padding.js";
import { minimumResumeBulletCount } from "./bullet-count-rules.js";

export type ResumeGenerationBlockerCode =
  | "layout_not_current"
  | "layout_not_qualified"
  | "item_tier_missing"
  | "bullet_count_too_low"
  | "bullet_provenance_missing"
  | "grounded_evidence_missing"
  | "augmented_confirmation_pending"
  | "sentence_punctuation"
  | "bullet_line_count_too_low"
  | "bullet_content_padding"
  | "critical_skill_evidence_missing";

export interface ResumeGenerationBlocker {
  code: ResumeGenerationBlockerCode;
  message: string;
  itemId?: string;
  bulletId?: string;
}

export interface ResumeGenerationReadiness {
  ready: boolean;
  blockers: ResumeGenerationBlocker[];
}

/** Deterministic host gate shared by preview, save and export. */
export function resumeGenerationReadiness(
  workspace: ResumeWorkspace,
): ResumeGenerationReadiness {
  const blockers: ResumeGenerationBlocker[] = [];
  const missingCriticalSkills = missingCriticalSkillEvidence(workspace);
  if (missingCriticalSkills.length) {
    blockers.push({
      code: "critical_skill_evidence_missing",
      message: `关键技能缺少直接经历证据：${missingCriticalSkills
        .map((requirement) => requirement.text).join("、")}`,
    });
  }
  if (
    workspace.compileObservedRevision !== undefined &&
    workspace.compileObservedRevision !== workspace.revision
  ) {
    blockers.push({
      code: "layout_not_current",
      message: "当前修订尚未完成真实版面测量",
    });
  }
  if (!workspace.compileResult.qualified) {
    blockers.push({
      code: "layout_not_qualified",
      message: layoutFailureMessage(workspace),
    });
  }
  const visibleBulletIds = workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets.map((bullet) => bullet.id)),
  );
  const measuredBulletIds = new Set(
    workspace.compileResult.bullets.map((bullet) => bullet.bulletId),
  );
  if (
    measuredBulletIds.size !== visibleBulletIds.length ||
    visibleBulletIds.some((id) => !measuredBulletIds.has(id))
  ) {
    blockers.push({
      code: "layout_not_current",
      message: "当前 bullet 与真实版面测量结果不一致",
    });
  }
  for (const target of bulletDepthRewriteTargets(workspace)) {
    blockers.push({
      code: "bullet_line_count_too_low",
      message: "main/secondary 经历的普通 bullet 实测必须达到 2–3 行",
      itemId: target.itemId,
      bulletId: target.bulletId,
    });
  }
  const hasCurrentProvenance = workspace.bulletProvenance !== undefined;
  const provenance = new Map(
    (workspace.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  const bindings = new Map(
    workspace.bindings.map((entry) => [entry.bulletId, entry]),
  );
  const supplementalEvidenceIds = new Set(
    (workspace.supplementalEvidence ?? []).map((entry) => entry.evidenceId),
  );
  for (const section of workspace.structure.sections) {
    for (const item of section.items) {
      const tier = workspace.itemTiers?.[item.id];
      const requiresTier = !["education", "skills"].includes(section.type);
      if (requiresTier && !tier) {
        blockers.push({
          code: "item_tier_missing",
          message: "经历缺少 main/secondary 匹配度分级",
          itemId: item.id,
        });
      }
      const minimum = minimumResumeBulletCount({
        sectionType: section.type,
        itemId: item.id,
        ...(tier ? { tier } : {}),
      });
      if (item.bullets.length < minimum) {
        blockers.push({
          code: "bullet_count_too_low",
          message: `${tier ?? section.type} 内容至少需要 ${minimum} 条 bullet`,
          itemId: item.id,
        });
      }
      for (const bullet of item.bullets) {
        const paddingIssue = findResumePaddingIssue(bullet.text);
        if (paddingIssue) {
          blockers.push({
            code: "bullet_content_padding",
            message: `bullet 包含${paddingIssue}，必须改写为具体动作、对象、方法或结果`,
            itemId: item.id,
            bulletId: bullet.id,
          });
        }
        const source = provenance.get(bullet.id);
        if (!source && hasCurrentProvenance) {
          blockers.push({
            code: "bullet_provenance_missing",
            message: "bullet 缺少来源记录",
            itemId: item.id,
            bulletId: bullet.id,
          });
        } else if (!source && !bindings.has(bullet.id)) {
          blockers.push({
            code: "grounded_evidence_missing",
            message: "旧版事实型 bullet 缺少可验证证据",
            itemId: item.id,
            bulletId: bullet.id,
          });
        } else if (source &&
          source.origin === "grounded" &&
          (
            !source.evidenceIds.length ||
            (
              source.evidenceIds.some(
                (evidenceId) => !supplementalEvidenceIds.has(evidenceId),
              ) &&
              !bindings.has(bullet.id)
            )
          )
        ) {
          blockers.push({
            code: "grounded_evidence_missing",
            message: "事实型 bullet 缺少可验证证据",
            itemId: item.id,
            bulletId: bullet.id,
          });
        } else if (source &&
          source.origin === "agent_augmented" &&
          source.confirmation !== "confirmed"
        ) {
          blockers.push({
            code: "augmented_confirmation_pending",
            message: "AI 补写内容尚未得到用户确认",
            itemId: item.id,
            bulletId: bullet.id,
          });
        }
        if (hasSentencePunctuation(bullet.text)) {
          blockers.push({
            code: "sentence_punctuation",
            message: "bullet 末尾不得有句末标点",
            itemId: item.id,
            bulletId: bullet.id,
          });
        }
      }
    }
  }
  for (const pending of pendingAugmentedContent(workspace)) {
    if (pending.kind !== "fragment") continue;
    blockers.push({
      code: "augmented_confirmation_pending",
      message: "AI 补写片段尚未得到用户确认",
      itemId: pending.itemId,
      bulletId: pending.bulletId,
    });
  }
  return { ready: blockers.length === 0, blockers };
}

export function generationWorkspaceStatus(
  workspace: ResumeWorkspace,
): ResumeWorkspaceStatus {
  if (missingCriticalSkillEvidence(workspace).length) {
    return "needs_user_decision";
  }
  if (resumeGenerationReadiness(workspace).ready) return "ready_for_approval";
  if (bulletDepthRewriteTargets(workspace).length) return "needs_revision";
  return deriveWorkspaceStatus(
    workspace.compileResult,
    workspace.structure,
    { sourceSnapshot: workspace.sourceSnapshot, bindings: workspace.bindings },
    workspace.maxBulletLines ?? 3,
  );
}

function layoutFailureMessage(workspace: ResumeWorkspace): string {
  const codes = workspace.compileResult.violations.map((item) => item.code);
  return codes.length
    ? `版面尚未达标：${codes.join("、")}`
    : "版面尚未达到单页、92% 页面占用率和 >70% 尾行要求";
}

function hasSentencePunctuation(value: string): boolean {
  return new Set(["。", ".", "！", "!", "？", "?", "；", ";", "：", ":"]).has(
    value.trim().at(-1) ?? "",
  );
}
