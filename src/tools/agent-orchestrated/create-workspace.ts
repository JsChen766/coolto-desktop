import { randomUUID } from "node:crypto";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { applyEducationCoursework } from "../../resume/education-coursework-input.js";
import type { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import { buildResumeSkeleton } from "../../resume/workspace/candidate-skeleton.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import {
  tiersForStructure,
  validateTierInputs,
} from "../../resume/workspace/resume-selection-tier.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { retainContentAcrossSourceExpansion } from "../../resume/workspace/source-reselection.js";
import { applyCriticalSkillGate } from "../../resume/workspace/critical-skill-gate.js";
import { applyBulletCountMaterialGate } from "../../resume/workspace/material-request-gate.js";
import { overflowSourceReselectionIssue } from "../../resume/workspace/overflow-source-reselection.js";
import type { ResumePublicationGateway } from "../../resume/save/types.js";
import type { ResumeReuseDraftSource } from
  "../../resume/reuse/local-draft-source.js";
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
import { buildAvailableResumeSnapshot } from "./available-source-snapshot.js";
import {
  applyLocalizedPositions,
  assertUniqueExperienceIds,
  mergeBaseItemTiers,
  sameFixedPresentation,
  sameRecord,
} from "./create-workspace-structure.js";
import { resolveWorkspaceBase } from "./create-workspace-base.js";
import { generationWorkspaceStatus } from
  "../../resume/workspace/generation-readiness.js";
import { createReuseAdaptation } from
  "../../resume/workspace/reuse-adaptation.js";
import { createItemLineBudgets } from
  "../../resume/workspace/item-line-budget.js";

export function createResumeWorkspaceTool(
  snapshotBuilder: ResumeSourceSnapshotBuilder,
  compiler: ResumeCompiler,
  store: ResumeWorkspaceStore,
  resumeReader?: ResumePublicationGateway,
  resumeDraftReader?: ResumeReuseDraftSource,
): AgentTool<typeof createWorkspaceParameters> {
  return {
    name: "create_resume_workspace",
    label: "创建简历工作区",
    description:
      "锁定目标 JD、Profile 和 Agent 选择的经历集合，并创建真实 Chromium 工作区。baseResumeId/baseDraftArtifactId 只能来自已核验候选且只能提供一个；宿主重核 evidence、重算新 JD coverage，将有效 grounded bullet 播种到新候选，不覆盖历史资产。教育自动纳入且不能改写；每个工作来源提交 localizedPosition。宿主继续执行 must-have、bullet 数、整页容量、单页、尾行和事实门禁。",
    executionMode: "sequential",
    parameters: createWorkspaceParameters,
    execute: async (_toolCallId, params) => {
      assertUniqueExperienceIds(params.experiences);
      const experienceIds = params.experiences.map((item) => item.experienceId);
      const { snapshot, availableExperienceIds } =
        await buildAvailableResumeSnapshot(
          snapshotBuilder,
          params.jdId,
          experienceIds,
        );
      const availableIds = new Set(availableExperienceIds);
      const availableInputs = params.experiences.filter((item) =>
        availableIds.has(item.experienceId)
      );
      const freshStructure = buildResumeSkeleton(
        snapshot, availableExperienceIds, params.language,
      );
      applyLocalizedPositions(freshStructure, availableInputs);
      const resolvedBase = await resolveWorkspaceBase({
        ...(params.baseResumeId ? { baseResumeId: params.baseResumeId } : {}),
        ...(params.baseDraftArtifactId
          ? { baseDraftArtifactId: params.baseDraftArtifactId } : {}),
        ...(resumeReader ? { resumeReader } : {}),
        ...(resumeDraftReader ? { draftReader: resumeDraftReader } : {}),
      });
      const baseResume = resolvedBase?.resume;
      const courseworkIssue = applyEducationCoursework(
        freshStructure,
        snapshot,
        params.educationCoursework,
        params.language,
      );
      if (courseworkIssue) {
        return rejectedEducationCourseworkResult(courseworkIssue);
      }
      const tierIssue = validateTierInputs(freshStructure, availableInputs);
      if (tierIssue) return rejectedTierResult(tierIssue);
      const agentItemTiers = tiersForStructure(freshStructure, availableInputs);
      const itemTiers = mergeBaseItemTiers(
        freshStructure,
        agentItemTiers,
        resolvedBase?.kind === "local" && resolvedBase.resume.jdId === snapshot.jd.id
          ? resolvedBase.itemTiers : undefined,
      );
      const baseSeed = baseResume
        ? seedFromPublishedResume({ fresh: freshStructure, snapshot, base: baseResume })
        : undefined;
      const reuseBase = resolvedBase && baseSeed ? {
        kind: resolvedBase.kind,
        resumeId: resolvedBase.sourceId, sourceJdId: baseResume!.jdId!,
        contentHash: baseResume!.contentHash,
        retainedBulletCount: baseSeed.retainedBulletCount,
        droppedBulletCount: baseSeed.droppedBulletCount,
      } : undefined;
      const existing = store.latest();
      if (
        existing &&
        existing.sourceSnapshot.sourceFingerprint === snapshot.sourceFingerprint &&
        existing.structure.language === params.language &&
        samePublishedResumeSeed(existing.reuseBase, reuseBase) &&
        existing.lineBudgetVersion === "item-lines-v1" &&
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
      let workspace: Parameters<ResumeWorkspaceStore["create"]>[0] = {
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
        itemTiers,
        lineBudgetVersion: "item-lines-v1",
        itemLineBudgets: createItemLineBudgets({
          structure: retained.structure,
          itemTiers,
          compileResult,
        }),
        bulletProvenance: retained.bulletProvenance,
        ...(retained.augmentedFragments.length
          ? { augmentedFragments: retained.augmentedFragments }
          : {}),
        ...(retained.augmentedBullets.length
          ? { augmentedBullets: retained.augmentedBullets }
          : {}),
        supplementalEvidence,
        awaitingUserConfirmation: retained.awaitingUserConfirmation,
      };
      const reuseAdaptation = createReuseAdaptation(workspace);
      if (reuseAdaptation) workspace = { ...workspace, reuseAdaptation };
      workspace.status = generationWorkspaceStatus(workspace);
      workspace = applyBulletCountMaterialGate(applyCriticalSkillGate(workspace));
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
