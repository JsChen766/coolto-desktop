import { randomUUID } from "node:crypto";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../../resume/template-contract.js";
import { buildResumeSkeleton } from "../../resume/workspace/candidate-skeleton.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import type { ResumeItemTier } from "../../resume/workspace/types.js";
import {
  tiersForStructure,
  validateTierInputs,
} from "../../resume/workspace/resume-selection-tier.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { buildAgentWorkspaceView } from "../../resume/workspace/agent-workspace-view.js";
import { buildAgentSourceView } from "../../resume/workspace/agent-source-view.js";
import { retainContentAcrossSourceExpansion } from "../../resume/workspace/source-reselection.js";
import { wholePageWritingBudget } from "../../resume/workspace/whole-page-writing-budget.js";
import { applyCriticalSkillGate } from "../../resume/workspace/critical-skill-gate.js";
import { overflowSourceReselectionIssue } from "../../resume/workspace/overflow-source-reselection.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";

const namedTier = Type.Union([
  Type.Literal("main"),
  Type.Literal("secondary"),
  Type.Literal("utility"),
]);
const tier = Type.Union([
  namedTier,
  Type.String({
    minLength: 1,
    description: "只允许 main、secondary、utility；教育和明确 skills 来源请省略 tier",
  }),
  Type.Null(),
]);
const parameters = Type.Object({
  jdId: Type.String({ minLength: 1 }),
  language: Type.Union([Type.Literal("zh-CN"), Type.Literal("en-US")]),
  experiences: Type.Array(
    Type.Object({
      experienceId: Type.String({
        description: "原样使用 search_experiences 返回的短 id（如 exp_1）",
        minLength: 1,
      }),
      tier: Type.Optional(tier),
    }),
    { minItems: 1 },
  ),
});

export function createResumeWorkspaceTool(
  snapshotBuilder: ResumeSourceSnapshotBuilder,
  compiler: ResumeCompiler,
  store: ResumeWorkspaceStore,
): AgentTool<typeof parameters> {
  return {
    name: "create_resume_workspace",
    label: "创建简历工作区",
    description:
      "锁定目标 JD、Profile 和 Agent 选择的经历集合，并自动补齐经历库中全部 active 教育经历，创建空简历骨架并执行一次真实 Chromium 测量。宿主会检查 must-have 技术要求是否有直接经历证据，缺失时立即返回 request_more_material；wholePageBudget 同时给出 main/secondary 普通 bullet 实测 2–3 行的硬预算。main/secondary/utility 由你判断；education 和已标注 skills 的来源不传 tier，旧数据里的纯语言、工具或证书行传 utility。首稿欠填可用同一 JD 和扩大的非教育经历集合再次调用并保留已有内容；溢出时只有 nextAction.requiredInput=reselectWithoutOneExperience 才可缩减集合，且一次只能移除一段非教育经历。相同选择重复调用不会修改 revision。",
    executionMode: "sequential",
    parameters,
    execute: async (_toolCallId, params) => {
      assertUniqueExperienceIds(params.experiences);
      const experienceIds = params.experiences.map((item) => item.experienceId);
      const snapshot = await snapshotBuilder.build({
        jdId: params.jdId,
        experienceIds,
        template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
      });
      const freshStructure = buildResumeSkeleton(snapshot, experienceIds, params.language);
      const tierIssue = validateTierInputs(freshStructure, params.experiences);
      if (tierIssue) return rejectedTierResult(tierIssue);
      const itemTiers = tiersForStructure(freshStructure, params.experiences);
      const existing = store.latest();
      if (
        existing &&
        existing.sourceSnapshot.sourceFingerprint === snapshot.sourceFingerprint &&
        existing.structure.language === params.language &&
        sameRecord(existing.itemTiers ?? {}, itemTiers)
      ) {
        return result(existing, "unchanged", []);
      }
      const overflowIssue = existing
        ? overflowSourceReselectionIssue(
            existing,
            snapshot,
            params.language,
            itemTiers,
          )
        : undefined;
      if (overflowIssue) {
        return rejectedReselectionResult(existing!, overflowIssue);
      }
      const reselectingSameTarget = Boolean(
        existing &&
        existing.sourceSnapshot.jd.id === snapshot.jd.id &&
        existing.structure.language === params.language,
      );
      const retained = reselectingSameTarget
        ? retainContentAcrossSourceExpansion(
            freshStructure,
            existing!,
            snapshot,
          )
        : {
            structure: freshStructure,
            bindings: [],
            bulletProvenance: [],
            augmentedBullets: [],
            augmentedFragments: [],
            awaitingUserConfirmation: null,
          };
      const compileResult = await compiler.compile(retained.structure);
      const revision = reselectingSameTarget ? existing!.revision + 1 : 0;
      const selectedIds = new Set(
        snapshot.experiences.map((experience) => experience.id),
      );
      const supplementalEvidence = reselectingSameTarget
        ? (existing!.supplementalEvidence ?? []).filter((entry) =>
            selectedIds.has(entry.experienceId),
          )
        : [];
      const workspace = applyCriticalSkillGate({
        candidateId: reselectingSameTarget
          ? existing!.candidateId
          : `resume-workspace-${randomUUID()}`,
        revision,
        patchCount: reselectingSameTarget ? existing!.patchCount + 1 : 0,
        contentApplyCount: 0,
        status: "writing",
        sourceSnapshot: snapshot,
        structure: retained.structure,
        bindings: retained.bindings,
        compileResult,
        compileObservedRevision: revision,
        bestSnapshot: {
          revision,
          structure: structuredClone(retained.structure),
          bindings: structuredClone(retained.bindings),
          compileResult: structuredClone(compileResult),
        },
        qualityReviewStarted: false,
        repairRound: 0,
        repairHistory: [],
        maxBulletLines: 3,
        itemTiers,
        bulletProvenance: retained.bulletProvenance,
        ...(retained.augmentedFragments.length
          ? { augmentedFragments: retained.augmentedFragments }
          : {}),
        ...(retained.augmentedBullets.length
          ? { augmentedBullets: retained.augmentedBullets }
          : {}),
        supplementalEvidence,
        awaitingUserConfirmation: retained.awaitingUserConfirmation,
      } satisfies Parameters<ResumeWorkspaceStore["create"]>[0]);
      const stored = reselectingSameTarget
        ? store.replace(workspace, existing!.revision)
        : store.create(workspace);
      const previousExperienceIds = new Set(
        existing?.sourceSnapshot.experiences.map((item) => item.id) ?? [],
      );
      const newItemIds = stored.structure.sections.flatMap((section) =>
        section.items
          .filter(
            (item) =>
              item.source_experience_id &&
              !previousExperienceIds.has(item.source_experience_id),
          )
          .map((item) => item.id),
      );
      return result(
        stored,
        reselectingSameTarget ? "reselected" : "created",
        newItemIds,
      );
    },
  };
}

function rejectedTierResult(reason: string) {
  const payload = {
    status: "rejected",
    writeRejectedReason: reason,
    retry: "补齐当前完整 experiences 中缺失的 tier 后重新调用；education 和已标注 skills 的来源仍不传 tier",
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    details: payload,
  };
}

function rejectedReselectionResult(
  workspace: ResumeWorkspace,
  reason: string,
) {
  const payload = {
    ...buildAgentWorkspaceView(workspace),
    writeRejectedReason: reason,
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    details: payload,
  };
}

function result(
  workspace: NonNullable<ReturnType<ResumeWorkspaceStore["latest"]>>,
  selectionMode: "created" | "unchanged" | "reselected",
  newItemIds: readonly string[],
) {
  const payload = {
    ...buildAgentWorkspaceView(workspace),
    sourceSelection: {
      mode: selectionMode,
      selectedExperienceCount: workspace.sourceSnapshot.experiences.length,
      newItemIds,
      nextWriteScope:
        selectionMode === "reselected" && newItemIds.length
          ? "write_all_new_items_only_then_compile"
          : "write_current_unwritten_items",
    },
    wholePageBudget: wholePageWritingBudget(workspace),
    ...buildAgentSourceView(workspace),
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    details: payload,
  };
}

function assertUniqueExperienceIds(
  inputs: readonly { experienceId: string }[],
): void {
  const ids = inputs.map((input) => input.experienceId.trim());
  if (new Set(ids).size !== ids.length) throw new Error("experiences 含重复 ID");
}

function sameRecord(
  left: Record<string, ResumeItemTier>,
  right: Record<string, ResumeItemTier>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
