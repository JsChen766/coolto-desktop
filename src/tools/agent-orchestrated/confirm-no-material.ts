import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { resumeContentProgressKey } from "../../resume/workspace/agent-progress-key.js";
import { buildAgentWorkspaceReceipt } from "../../resume/workspace/agent-workspace-view.js";
import { bulletCountRepairPlan } from
  "../../resume/workspace/bullet-count-repair.js";
import { ResumeWorkspaceError } from "../../resume/workspace/errors.js";
import { isFirstResumeGeneration } from
  "../../resume/workspace/first-generation-policy.js";
import { startEvidenceReassessment } from
  "../../resume/workspace/evidence-assessment.js";
import { resumeGenerationReadiness } from
  "../../resume/workspace/generation-readiness.js";
import { scenarioMaterialQuestion } from "../../resume/workspace/material-question.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { pruneUnderSupportedFirstGenerationItems } from
  "../../resume/workspace/first-generation-closure.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { resumeWriteResultForModel } from "./resume-write-result-for-model.js";

const parameters = Type.Object({
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
  scenarioQuestions: Type.Optional(Type.Array(Type.String({
    minLength: 8,
    maxLength: 240,
  }), { minItems: 1, maxItems: 3 })),
});

const ELIGIBLE_KINDS = new Set([
  "agent_declared", "critical_skill", "bullet_count_insufficient", "page_fill_stalled",
  "line_rewrite_stalled", "tail_repair_stalled",
]);

export function createConfirmNoResumeMaterialTool(
  store: ResumeWorkspaceStore,
  currentUserMessageTimestamp: () => number | undefined,
  compiler?: ResumeCompiler,
): AgentTool<typeof parameters> {
  return {
    name: "confirm_no_resume_material",
    label: "推进简历素材引导",
    description:
      "用户对首次补充邀约说不需要，或补充完成后明确表示没有更多材料时，不传问题进入最终收尾；这不等于停止生成。只有用户主动希望一起回忆时，才提交 1–3 个具体场景问题。",
    executionMode: "sequential",
    parameters,
    execute: async (_toolCallId, params) => {
      const workspace = store.get(params.candidateId);
      if (workspace.revision !== params.expectedRevision) {
        throw new ResumeWorkspaceError(
          "stale_candidate_revision",
          `Candidate revision changed from ${params.expectedRevision} to ${workspace.revision}.`,
        );
      }
      const request = workspace.materialRequest;
      const reopeningStalledClosure = Boolean(
        request?.status === "declined" &&
        request.resolution === "best_effort_stalled" &&
        workspace.factNeutralAuthorization,
      );
      if ((workspace.status !== "needs_user_decision" &&
        !reopeningStalledClosure) ||
        !request?.kind || !ELIGIBLE_KINDS.has(request.kind)) {
        throw new Error("当前暂停原因不允许用中性内容代替真实事实");
      }
      const messageTimestamp = currentUserMessageTimestamp();
      if (!messageTimestamp) throw new Error("当前用户消息来源不可用，不能确认无补充事实");
      let closureWorkspace = prepareFirstGenerationClosure(workspace);
      if (bulletCountRepairPlan(closureWorkspace).mode ===
        "request_more_material") {
        if (!compiler) {
          throw new Error("首次生成收尾缺少真实版面编译器，不能安全移除证据不足的经历");
        }
        closureWorkspace = await pruneUnderSupportedFirstGenerationItems(
          closureWorkspace,
          compiler,
        );
      }
      const updated = request.discoveryStage === "scenario_probe" ||
          !params.scenarioQuestions?.length
        ? authorizeNeutral(
            closureWorkspace,
            messageTimestamp,
            params.scenarioQuestions,
          )
        : requestScenarioProbe(
            closureWorkspace,
            messageTimestamp,
            params.scenarioQuestions,
          );
      const stored = store.replace(updated, workspace.revision);
      const payload = buildAgentWorkspaceReceipt(stored);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(resumeWriteResultForModel({ ...payload })),
        }],
        details: { ...payload, loopGuardKey: resumeContentProgressKey(stored) },
      };
    },
  };
}

function requestScenarioProbe(
  workspace: ResumeWorkspace,
  messageTimestamp: number,
  scenarioQuestions: readonly string[] | undefined,
): ResumeWorkspace {
  if (!scenarioQuestions) {
    throw new Error("用户希望一起回忆时，必须提交 1–3 个岗位场景问题");
  }
  const revision = workspace.revision + 1;
  return {
    ...workspace,
    revision,
    compileObservedRevision: revision,
    bestSnapshot: { ...workspace.bestSnapshot, revision },
    materialRequest: {
      ...workspace.materialRequest!,
      question: scenarioMaterialQuestion(scenarioQuestions),
      discoveryStage: "scenario_probe",
      firstUnableMessageTimestamp: messageTimestamp,
      scenarioQuestions: [...scenarioQuestions],
    },
  };
}

function authorizeNeutral(
  workspace: ResumeWorkspace,
  messageTimestamp: number,
  scenarioQuestions: readonly string[] | undefined,
): ResumeWorkspace {
  const request = workspace.materialRequest!;
  if (scenarioQuestions?.length) {
    throw new Error("场景追问后只有用户明确表示全部没有时才能授权，第二次调用不要再传问题");
  }
  if (request.discoveryStage === "scenario_probe" &&
    request.firstUnableMessageTimestamp === messageTimestamp) {
    throw new Error("场景问题发出后必须等待用户回答，不能在同一轮自行解锁");
  }
  const kind = request.kind! as
    "agent_declared" | "critical_skill" | "bullet_count_insufficient" |
    "page_fill_stalled" | "line_rewrite_stalled" | "tail_repair_stalled";
  const revision = workspace.revision + 1;
  const updated: ResumeWorkspace = {
    ...workspace,
    revision,
    status: "writing",
    compileObservedRevision: revision,
    bestSnapshot: { ...workspace.bestSnapshot, revision },
    factNeutralAuthorization: {
      sourceRequestKind: kind,
      confirmedAt: new Date().toISOString(),
      confirmedMessageTimestamp: messageTimestamp,
    },
  };
  delete updated.materialRequest;
  delete updated.pageFillProgress;
  delete updated.lineRewriteProgress;
  delete updated.tailRepairProgress;
  const reassessed = startEvidenceReassessment(updated);
  return resumeGenerationReadiness(reassessed).ready
    ? { ...reassessed, status: "ready_for_approval" }
    : reassessed;
}

/** Keeps truthful bullets by demoting evidence-poor main items after opt-out. */
function prepareFirstGenerationClosure(
  workspace: ResumeWorkspace,
): ResumeWorkspace {
  if (!isFirstResumeGeneration(workspace)) {
    if (workspace.materialRequest?.kind === "bullet_count_insufficient") {
      throw new Error("历史简历的 main 经历数量门槛不能自动降级");
    }
    return workspace;
  }
  const itemTiers = { ...workspace.itemTiers };
  let demoted = 0;
  for (const item of workspace.structure.sections.flatMap(
    (section) => section.items,
  )) {
    if (itemTiers[item.id] === "main" && item.bullets.length === 2) {
      itemTiers[item.id] = "secondary";
      demoted += 1;
    }
  }
  return demoted ? { ...workspace, itemTiers } : workspace;
}
