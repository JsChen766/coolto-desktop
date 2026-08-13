import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../../resume/template-contract.js";
import { buildResumeSkeleton } from "../../resume/workspace/candidate-skeleton.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { deriveWorkspaceStatus } from "../../resume/workspace/workspace-status.js";
import { buildModelPayload } from "../../resume/workspace/model-payload.js";
import { projectResumeWorkspace } from "../../resume/workspace/workspace-projection.js";

const parameters = Type.Object({
  jdId: Type.String({ minLength: 1 }),
  experienceIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    maxItems: 30,
    description:
      "要纳入简历的有序经历 ID。顺序用于最终展示；必须包含至少一条 education 经历。",
  }),
  language: Type.Union([Type.Literal("zh-CN"), Type.Literal("en-US")]),
  maxBulletLines: Type.Optional(
    Type.Union([Type.Literal(2), Type.Literal(3)], {
      description: "单条 bullet 最大行数（默认 3）。",
    }),
  ),
});

/**
 * Creates the empty-draft workspace for agent-orchestrated generation: locks
 * the source snapshot, builds the standard skeleton and runs one real
 * Chromium compile so the budget numbers are true from the first write.
 * Idempotent for the same source fingerprint.
 */
export function createPrepareResumeDraftTool(
  snapshotBuilder: ResumeSourceSnapshotBuilder,
  compiler: ResumeCompiler,
  store: ResumeWorkspaceStore,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_resume_draft",
    label: "创建简历草稿骨架",
    description:
      "基于快照创建空简历草稿（骨架 + 真实页面预算），返回 itemId 列表与预算。同一来源重复调用幂等。随后用 write_bullet 逐条并行写入 bullet。本工具不生成文本。",
    parameters,
    execute: async (_toolCallId, params) => {
      const maxBulletLines = params.maxBulletLines ?? 3;
      const snapshot = await snapshotBuilder.build({
        jdId: params.jdId,
        experienceIds: [...params.experienceIds],
        template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
      });
      const existing = store.latest();
      if (
        existing &&
        existing.sourceSnapshot.sourceFingerprint === snapshot.sourceFingerprint
      ) {
        return buildResult(existing);
      }
      const structure = buildResumeSkeleton(
        snapshot,
        params.experienceIds,
        params.language,
      );
      const compileResult = await compiler.compile(structure);
      const candidateId = `draft-${snapshot.sourceFingerprint.slice(0, 12)}`;
      const workspace = store.create({
        candidateId,
        revision: 0,
        patchCount: 0,
        status: deriveWorkspaceStatus(compileResult, structure),
        sourceSnapshot: snapshot,
        structure,
        bindings: [],
        compileResult,
        bestSnapshot: {
          revision: 0,
          structure: structuredClone(structure),
          bindings: [],
          compileResult: structuredClone(compileResult),
        },
        qualityReviewStarted: false,
        repairRound: 0,
        repairHistory: [],
        maxBulletLines,
      });
      return buildResult(workspace);
    },
  };
}

function buildResult(workspace: ReturnType<ResumeWorkspaceStore["latest"]>) {
  if (!workspace) throw new Error("Resume draft workspace was not created");
  const projection = projectResumeWorkspace(workspace);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(buildModelPayload(workspace)) },
        ],
        details: projection,
      };
}
