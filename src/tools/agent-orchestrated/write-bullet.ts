import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { applyCandidatePatch } from "../../resume/workspace/candidate-patch.js";
import { ResumeWorkspaceError } from "../../resume/workspace/errors.js";
import { findItemInStructure } from "../../resume/workspace/section-lookup.js";
import { projectResumeWorkspace } from "../../resume/workspace/workspace-projection.js";
import { validateAndBuildBullet } from "./bullet-validator.js";

function defaultBulletTarget(language: string): {
  min: number;
  max: number;
} {
  // The lower bound sits below the model's natural output length so most
  // drafts pass on the first try; short bullets are then lengthened by the
  // agent's tail pass (shortByChars) instead of write-time retries.
  return language === "en-US"
    ? { min: 130, max: 310 }
    : { min: 75, max: 165 };
}

/**
 * An agent-provided target may not demand a stricter minimum than the product
 * floor: capping it at the default range stops rewrite loops on drafts the
 * product would accept (e.g. explicit {92, 165} on a 63-char draft).
 */
function clampAgentTarget(target: { min: number; max: number }): {
  min: number;
  max: number;
} {
  return {
    min: Math.min(target.min, defaultBulletTarget("zh-CN").min),
    max: Math.max(target.max, defaultBulletTarget("zh-CN").max),
  };
}

const parameters = Type.Object({
  itemId: Type.String({
    minLength: 1,
    description: "目标 section item（如 item-{experienceId}、item-skills-synthetic）。",
  }),
  evidenceIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    maxItems: 3,
    description:
      "本条 bullet 引用的证据（来自最新 inspect 返回的 availableEvidence），同一经历且未被消费。",
  }),
  bulletText: Type.String({
    minLength: 1,
    description: "完整、通顺的一句话，事实必须全部来自证据原文。",
  }),
  targetChars: Type.Optional(
    Type.Object({
      min: Type.Integer({ minimum: 20 }),
      max: Type.Integer({ minimum: 20 }),
    }),
  ),
  afterBulletId: Type.Optional(
    Type.String({
      description: "插入到该 bullet 之后；缺省追加到 item 末尾。",
    }),
  ),
}, {
  description: "逐条写入一条简历 bullet。可并行调用多个 write_bullet（同一条消息内同时发起）。",
});

/**
 * Agent-orchestrated per-bullet writer. The agent authors bulletText itself
 * and the host only validates (evidence membership/uniqueness, length,
 * numbers, repetition) before appending to the draft. Validation and commit
 * are fully synchronous, so parallel invocations from one assistant message
 * serialize safely on the event loop without revision conflicts.
 */
export function createWriteBulletTool(
  store: ResumeWorkspaceStore,
): AgentTool<typeof parameters> {
  return {
    name: "write_bullet",
    label: "写入一条简历 bullet",
    description:
      "把 Agent 编写的一条 bullet 写入当前草稿。宿主校验证据归属与唯一、长度（若给 targetChars）、数字逐字可验证、无重复片段；通过后落盘。可并行调用（同一条消息内多个 write_bullet 同时执行）。",
    executionMode: "parallel",
    parameters,
    execute: async (_toolCallId, params) => {
      const workspace = store.latest();
      if (!workspace) {
        throw new ResumeWorkspaceError(
          "candidate_not_found",
          "当前没有简历草稿，请先调用 prepare_resume_draft。",
        );
      }
      const item = findItemInStructure(workspace.structure, params.itemId);
      if (!item) {
        throw new ResumeWorkspaceError(
          "item_not_found",
          `Item ${params.itemId} 不在当前草稿中。`,
        );
      }
      const validated = validateAndBuildBullet(
        workspace.sourceSnapshot,
        item,
        workspace.bindings,
        [...params.evidenceIds],
        params.bulletText,
        params.targetChars
          ? clampAgentTarget(params.targetChars)
          : defaultBulletTarget(workspace.structure.language),
      );
      if (!validated.ok) {
        throw new ResumeWorkspaceError("invalid_patch_operation", validated.reason);
      }
      const patched = applyCandidatePatch(
        workspace.sourceSnapshot,
        workspace.structure,
        workspace.bindings,
        [
          {
            op: "add_bullet",
            itemId: item.id,
            ...(params.afterBulletId
              ? { afterBulletId: params.afterBulletId }
              : {}),
            binding: validated.binding,
          },
        ],
      );
      const revision = workspace.revision + 1;
      const updated = store.replace(
        {
          ...workspace,
          revision,
          patchCount: workspace.patchCount + 1,
          structure: patched.structure,
          bindings: patched.bindings,
          lastOperationReport: {
            repairs: [],
            rejected: [],
          },
        },
        workspace.revision,
      );
      const projection = projectResumeWorkspace(updated);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              accepted: true,
              bulletId: validated.binding.bulletId,
              revision: updated.revision,
              evidenceIds: validated.binding.excerpts.map(
                (excerpt) =>
                  `${excerpt.experienceId}:${excerpt.sourceStart}:${excerpt.sourceEnd}`,
              ),
            }),
          },
        ],
        details: projection,
      };
    },
  };
}
