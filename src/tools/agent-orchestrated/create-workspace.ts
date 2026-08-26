import { randomUUID } from "node:crypto";

import type { AgentTool } from "@earendil-works/pi-agent-core";

import { applyEducationCoursework } from "../../resume/education-coursework-input.js";
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
import { retainContentAcrossSourceExpansion } from "../../resume/workspace/source-reselection.js";
import { applyCriticalSkillGate } from "../../resume/workspace/critical-skill-gate.js";
import {
  applyBulletCountMaterialGate,
  applyInitialMaterialFeasibilityGate,
} from "../../resume/workspace/material-request-gate.js";
import { overflowSourceReselectionIssue } from "../../resume/workspace/overflow-source-reselection.js";
import type { ResumePublicationGateway } from "../../resume/save/types.js";
import {
  samePublishedResumeSeed,
  seedFromPublishedResume,
} from "../../resume/workspace/published-resume-seed.js";
import {
  createWorkspaceResult,
  rejectedEducationCourseworkResult,
  rejectedReselectionResult,
  rejectedTierResult,
} from "./create-workspace-result.js";
import { createWorkspaceParameters } from "./create-workspace-parameters.js";
export function createResumeWorkspaceTool(
  snapshotBuilder: ResumeSourceSnapshotBuilder,
  compiler: ResumeCompiler,
  store: ResumeWorkspaceStore,
  resumeReader?: ResumePublicationGateway,
): AgentTool<typeof createWorkspaceParameters> {
  return {
    name: "create_resume_workspace",
    label: "创建简历工作区",
    description:
      "锁定目标 JD、Profile 和 Agent 选择的经历集合，并自动补齐经历库中全部 active 教育经历，创建简历骨架并执行一次真实 Chromium 测量。可选 baseResumeId 只能来自已核验的历史候选；宿主重新校验逐字 evidence、重算新 JD coverage，并把有效 grounded bullet 播种到新的本地候选，不覆盖历史 Resume。每个工作来源用 localizedPosition 提交根据 language 翻译后的单一语言职位，公司专有名词保持原文；不增加翻译调用。教育课程通过 educationCoursework 提交课程数组与逐字 sourceQuote，宿主验证原始教育经历后固定投影；不得编造、翻译或通过 apply_resume_content 改写。宿主会检查 must-have 技术要求是否有直接经历证据，缺失时立即返回 request_more_material；wholePageBudget 同时给出 main/secondary 普通 bullet 实测 2–3 行的硬预算。main/secondary/utility 由你判断；education 和已标注 skills 的来源不传 tier，旧数据里的纯语言、工具或证书行传 utility。首稿欠填可用同一 JD 和扩大的非教育经历集合再次调用并保留已有内容；溢出时只有 nextAction.requiredInput=reselectWithoutOneExperience 才可缩减集合，且一次只能移除一段非教育经历。相同选择重复调用不会修改 revision。",
    executionMode: "sequential",
    parameters: createWorkspaceParameters,
    execute: async (_toolCallId, params) => {
      assertUniqueExperienceIds(params.experiences);
      const experienceIds = params.experiences.map((item) => item.experienceId);
      const snapshot = await snapshotBuilder.build({
        jdId: params.jdId,
        experienceIds,
        template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
      });
      if (params.baseResumeId && !resumeReader) {
        throw new Error("当前运行时不支持历史 Resume 基底");
      }
      const baseResume = params.baseResumeId
        ? await resumeReader!.getResume(params.baseResumeId)
        : undefined;
      const freshStructure = buildResumeSkeleton(snapshot, experienceIds, params.language);
      applyLocalizedPositions(freshStructure, params.experiences);
      const courseworkIssue = applyEducationCoursework(
        freshStructure,
        snapshot,
        params.educationCoursework,
        params.language,
      );
      if (courseworkIssue) {
        return rejectedEducationCourseworkResult(courseworkIssue);
      }
      const tierIssue = validateTierInputs(freshStructure, params.experiences);
      if (tierIssue) return rejectedTierResult(tierIssue);
      const itemTiers = tiersForStructure(freshStructure, params.experiences);
      const baseSeed = baseResume
        ? seedFromPublishedResume({ fresh: freshStructure, snapshot, base: baseResume })
        : undefined;
      const reuseBase = baseResume && baseSeed ? {
        resumeId: baseResume.id, sourceJdId: baseResume.jdId!,
        contentHash: baseResume.contentHash,
        retainedBulletCount: baseSeed.retainedBulletCount,
        droppedBulletCount: baseSeed.droppedBulletCount,
      } : undefined;
      const existing = store.latest();
      if (
        existing &&
        existing.sourceSnapshot.sourceFingerprint === snapshot.sourceFingerprint &&
        existing.structure.language === params.language &&
        samePublishedResumeSeed(existing.reuseBase, reuseBase) &&
        sameRecord(existing.itemTiers ?? {}, itemTiers) &&
        sameFixedPresentation(existing.structure, freshStructure)
      ) {
        return createWorkspaceResult(existing, "unchanged", []);
      }
      const continuingSameWorkspace = Boolean(
        existing && existing.sourceSnapshot.jd.id === snapshot.jd.id &&
        existing.structure.language === params.language &&
        samePublishedResumeSeed(existing.reuseBase, reuseBase),
      );
      const overflowIssue = continuingSameWorkspace
        ? overflowSourceReselectionIssue(
            existing!,
            snapshot,
            params.language,
            itemTiers,
          )
        : undefined;
      if (overflowIssue) {
        return rejectedReselectionResult(existing!, overflowIssue);
      }
      const retained = continuingSameWorkspace
        ? retainContentAcrossSourceExpansion(
            freshStructure,
            existing!,
            snapshot,
          )
        : baseSeed
          ? {
              ...baseSeed,
              augmentedBullets: [], augmentedFragments: [],
              awaitingUserConfirmation: null,
            }
        : {
            structure: freshStructure,
            bindings: [],
            bulletProvenance: [],
            augmentedBullets: [],
            augmentedFragments: [],
            awaitingUserConfirmation: null,
          };
      const compileResult = await compiler.compile(retained.structure);
      const revision = continuingSameWorkspace ? existing!.revision + 1 : 0;
      const selectedIds = new Set(
        snapshot.experiences.map((experience) => experience.id),
      );
      const supplementalEvidence = continuingSameWorkspace
        ? (existing!.supplementalEvidence ?? []).filter((entry) =>
            selectedIds.has(entry.experienceId),
          )
        : [];
      const workspace = applyInitialMaterialFeasibilityGate(
        applyBulletCountMaterialGate(applyCriticalSkillGate({
        candidateId: continuingSameWorkspace
          ? existing!.candidateId
          : `resume-workspace-${randomUUID()}`,
        revision,
        patchCount: continuingSameWorkspace ? existing!.patchCount + 1 : 0,
        contentApplyCount: 0,
        status: "writing",
        sourceSnapshot: snapshot,
        ...(reuseBase ? { reuseBase } : {}),
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
        } satisfies Parameters<ResumeWorkspaceStore["create"]>[0])),
      );
      const stored = continuingSameWorkspace
        ? store.replace(workspace, existing!.revision)
        : store.create(workspace);
      const previousExperienceIds = new Set(
        continuingSameWorkspace
          ? existing!.sourceSnapshot.experiences.map((item) => item.id)
          : [],
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
      return createWorkspaceResult(
        stored,
        continuingSameWorkspace ? "reselected" : "created",
        newItemIds,
      );
    },
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

function applyLocalizedPositions(
  structure: ReturnType<typeof buildResumeSkeleton>,
  inputs: readonly { experienceId: string; localizedPosition?: string }[],
): void {
  const byExperience = new Map(inputs.flatMap((input) => {
    const value = input.localizedPosition?.trim();
    return value ? [[input.experienceId, value] as const] : [];
  }));
  const work = structure.sections.find((section) => section.type === "experience");
  for (const item of work?.items ?? []) {
    const translated = item.source_experience_id
      ? byExperience.get(item.source_experience_id)
      : undefined;
    if (translated) item.title = translated;
  }
}

function sameFixedPresentation(
  left: ReturnType<typeof buildResumeSkeleton>,
  right: ReturnType<typeof buildResumeSkeleton>,
): boolean {
  return JSON.stringify(fixedPresentation(left)) ===
    JSON.stringify(fixedPresentation(right));
}

function fixedPresentation(structure: ReturnType<typeof buildResumeSkeleton>) {
  return structure.sections.flatMap((section) => section.items.map((item) => [
    item.id,
    section.type === "experience" ? item.title : null,
    section.type === "education" ? item.raw_text : null,
  ]));
}
