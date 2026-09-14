import { randomUUID } from "node:crypto";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { applyEducationCoursework } from "../../resume/education-coursework-input.js";
import type { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
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
import type { ResumeReuseDraftSource } from "../../resume/reuse/local-draft-source.js";
import { samePublishedResumeSeed } from "../../resume/workspace/published-resume-seed.js";
import {
  createWorkspaceResult,
  rejectedEducationCourseworkResult,
  rejectedReselectionResult,
  rejectedTierResult,
} from "./create-workspace-result.js";
import { createWorkspaceParameters } from "./create-workspace-parameters.js";
import {
  mergeBaseItemTiers,
  sameFixedPresentation,
  sameRecord,
} from "./create-workspace-structure.js";
import { generationWorkspaceStatus } from "../../resume/workspace/generation-readiness.js";
import { createReuseAdaptation } from "../../resume/workspace/reuse-adaptation.js";
import { createItemLineBudgets } from "../../resume/workspace/item-line-budget.js";
import { pendingResumeWorkUnitMap } from "../../resume/workspace/work-unit-map.js";
import { sameResumeGenerationTarget } from "../../resume/source-strategy.js";
import type { ResumeProfilePreferenceBinding } from "../../resume/workspace/profile-preference-binding.js";
import { resolveWorkspaceSeed } from "./create-workspace-seed.js";
import { sameSelectionPolicy } from "../../resume/workspace/selection-policy.js";
import { prepareWorkspaceSelection } from "./create-workspace-selection.js";
export function createResumeWorkspaceTool(
  snapshotBuilder: ResumeSourceSnapshotBuilder,
  compiler: ResumeCompiler,
  store: ResumeWorkspaceStore,
  resumeReader?: ResumePublicationGateway,
  resumeDraftReader?: ResumeReuseDraftSource,
  profilePreferenceContext?: () => Promise<ResumeProfilePreferenceBinding>,
): AgentTool<typeof createWorkspaceParameters> {
  return {
    name: "create_resume_workspace",
    label: "创建简历工作区",
    description:
      "创建真实 Chromium 简历工作区。针对性简历使用 generationStrategy=tailored 并提供 jdId；通用简历使用 generationStrategy=general 且不得提供 jdId。用户坚持为不匹配岗位写指定经历时使用 selectionPolicy=user_directed：宿主按 Experience 优先复用基础简历、否则复用最近历史写法；有唯一明显相关经历才传 focusExperienceId。baseResumeId/baseDraftArtifactId 仅供普通 relevance 模式。教育自动纳入且不能改写；宿主始终重核 evidence，并执行 Experience 行数、整页容量、单页、尾行和事实门禁。",
    executionMode: "sequential",
    parameters: createWorkspaceParameters,
    execute: async (_toolCallId, params) => {
      const {
        selectionPolicy, snapshot, availableExperienceIds,
        tierInputs, freshStructure,
      } = await prepareWorkspaceSelection({
        snapshotBuilder,
        ...(params.generationStrategy
          ? { generationStrategy: params.generationStrategy } : {}),
        ...(params.selectionPolicy
          ? { selectionPolicy: params.selectionPolicy } : {}),
        ...(params.jdId ? { jdId: params.jdId } : {}),
        language: params.language,
        experiences: params.experiences,
        ...(params.focusExperienceId
          ? { focusExperienceId: params.focusExperienceId } : {}),
        hasBase: Boolean(params.baseResumeId || params.baseDraftArtifactId),
      });
      const profilePreferenceBinding = await profilePreferenceContext?.();
      if (profilePreferenceBinding && profilePreferenceBinding.profileLocalVersion === undefined) throw new Error("Profile 本机投影版本不可用，必须重新读取当前 Profile 后再创建工作区");
      const courseworkIssue = applyEducationCoursework(
        freshStructure,
        snapshot,
        params.educationCoursework,
        params.language,
      );
      if (courseworkIssue) {
        return rejectedEducationCourseworkResult(courseworkIssue);
      }
      const history = await resolveWorkspaceSeed({
        selectionPolicy,
        ...(params.baseResumeId ? { baseResumeId: params.baseResumeId } : {}),
        ...(params.baseDraftArtifactId
          ? { baseDraftArtifactId: params.baseDraftArtifactId } : {}),
        fresh: freshStructure,
        snapshot,
        experienceIds: availableExperienceIds,
        ...(resumeReader ? { resumeReader } : {}),
        ...(resumeDraftReader ? { draftReader: resumeDraftReader } : {}),
      });
      const tierIssue = validateTierInputs(freshStructure, tierInputs);
      if (tierIssue) return rejectedTierResult(tierIssue);
      const agentItemTiers = tiersForStructure(freshStructure, tierInputs);
      const itemTiers = mergeBaseItemTiers(
        freshStructure,
        agentItemTiers,
        history.baseItemTiers,
      );
      const baseSeed = history.seed; const reuseBase = history.reuseBase;
      const existing = store.latest();
      if (
        existing &&
        existing.sourceSnapshot.sourceFingerprint === snapshot.sourceFingerprint &&
        existing.structure.language === params.language &&
        sameSelectionPolicy(
          existing, selectionPolicy, params.focusExperienceId,
        ) &&
        samePublishedResumeSeed(existing.reuseBase, reuseBase) &&
        existing.lineBudgetVersion === "item-lines-v1" &&
        sameRecord(existing.itemTiers ?? {}, itemTiers) &&
        sameFixedPresentation(existing.structure, freshStructure) &&
        (existing.profilePreferenceBinding?.profileEntityVersion ?? null) === (profilePreferenceBinding?.profileEntityVersion ?? null) &&
        (existing.profilePreferenceBinding?.preferenceResolutionHash ?? null) === (profilePreferenceBinding?.preferenceResolutionHash ?? null) &&
        (existing.profilePreferenceBinding?.targetFingerprint ?? null) === (profilePreferenceBinding?.targetFingerprint ?? null) &&
        (existing.profilePreferenceBinding?.profileLocalVersion ?? null) === (profilePreferenceBinding?.profileLocalVersion ?? null)
      ) {
        return createWorkspaceResult(existing, "unchanged", []);
      }
      const continuingSameWorkspace = Boolean(
        existing && sameResumeGenerationTarget(existing.sourceSnapshot, snapshot) &&
        existing.structure.language === params.language &&
        sameSelectionPolicy(
          existing, selectionPolicy, params.focusExperienceId,
        ) &&
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
        ...(profilePreferenceBinding ? { profilePreferenceBinding } : {}),
        selectionPolicy,
        ...(selectionPolicy === "user_directed" ? {
          userDirectedSelection: {
            experienceIds: [...availableExperienceIds],
            focusExperienceId: params.focusExperienceId?.trim() ?? null,
          },
        } : {}),
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
        ...(!baseSeed ? { workUnitMap: pendingResumeWorkUnitMap(
          snapshot.sourceFingerprint,
        ) } : {}),
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
