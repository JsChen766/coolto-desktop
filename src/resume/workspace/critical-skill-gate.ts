import {
  isMustHave,
  sourceSupportsRequirement,
  textSupportsRequirement,
} from "../quality/requirement-coverage.js";
import type { ResumeSourceRequirementSnapshot } from "../source-types.js";
import type { ResumeWorkspace } from "./types.js";
import { createResumeMaterialRequest } from "./material-request.js";
import { hasPendingFirstGenerationGroundedWork } from
  "./first-generation-policy.js";

const SKILL_CATEGORIES = new Set([
  "technology", "technical", "skill", "skills", "tech", "tech_stack",
]);

export function missingCriticalSkillEvidence(
  workspace: Pick<ResumeWorkspace, "sourceSnapshot" | "supplementalEvidence">,
): ResumeSourceRequirementSnapshot[] {
  return workspace.sourceSnapshot.jd.requirements
    .filter(isCriticalSkill)
    .filter((requirement) =>
      !sourceSupportsRequirement(workspace.sourceSnapshot, requirement) &&
      !(workspace.supplementalEvidence ?? []).some((evidence) =>
        textSupportsRequirement(requirement, evidence.text),
      ),
    );
}

export function criticalSkillMaterialRequest(
  workspace: Pick<
    ResumeWorkspace,
    "candidateId" | "sourceSnapshot" | "supplementalEvidence" |
    "materialRequest" | "factNeutralAuthorization"
  >,
): ResumeWorkspace["materialRequest"] | undefined {
  if (workspace.factNeutralAuthorization) return undefined;
  const missing = missingCriticalSkillEvidence(workspace);
  if (!missing.length) return undefined;
  const labels = missing.slice(0, 3).map((requirement) =>
    `“${trimLabel(requirement.text)}”`
  ).join("、");
  return createResumeMaterialRequest(workspace, {
    kind: "critical_skill",
    reason: `目标岗位的 must-have 关键技能缺少直接经历证据：${labels}`,
    question: `目标岗位要求${labels}，但当前经历中没有可核验的直接事实，所以我不能安全地把这些能力写进简历。请补充你在哪段经历或项目中使用过这些技能、具体做了什么、采用了什么方法或技术栈，以及可验证的结果。你也可以上传旧简历、项目文档、报告、作品集或复盘材料；如果确实没有相关经历，可以直接说明或要求跳过这个警告，我会保留岗位匹配受限提示并继续完成。`,
    discoveryStage: "guidance",
  });
}

export function applyCriticalSkillGate(workspace: ResumeWorkspace): ResumeWorkspace {
  const request = criticalSkillMaterialRequest(workspace);
  if (request) {
    if (hasPendingFirstGenerationGroundedWork(workspace)) {
      const deferred = { ...workspace, status: "writing" as const };
      if (deferred.materialRequest?.kind === "critical_skill") {
        delete deferred.materialRequest;
      }
      return deferred;
    }
    return { ...workspace, status: "needs_user_decision", materialRequest: request };
  }
  if (workspace.materialRequest?.kind !== "critical_skill") return workspace;
  const resumed = { ...workspace, status: "writing" as const };
  delete resumed.materialRequest;
  return resumed;
}

export function criticalSkillWarning(workspace: ResumeWorkspace) {
  const missing = missingCriticalSkillEvidence(workspace);
  if (!missing.length) return undefined;
  return {
    code: "critical_skill_evidence_missing" as const,
    message: `目标岗位关键能力缺少可核验经历支持：${missing
      .map((requirement) => requirement.text).join("、")}`,
  };
}

function isCriticalSkill(requirement: ResumeSourceRequirementSnapshot): boolean {
  if (!isMustHave(requirement)) return false;
  const v2Category = requirement.v2Category?.trim().toLocaleLowerCase();
  if (v2Category) return SKILL_CATEGORIES.has(v2Category);
  return SKILL_CATEGORIES.has(requirement.category.trim().toLocaleLowerCase());
}

function trimLabel(value: string): string {
  const label = value.trim().replace(/\s+/gu, " ");
  return [...label].slice(0, 80).join("");
}
