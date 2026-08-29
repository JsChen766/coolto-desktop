import { Type } from "@earendil-works/pi-ai";
import { Unsafe, type TSchema, type TUnsafe } from "typebox";
import type { ResumeWorkUnitInput } from
  "../../resume/workspace/work-unit-types.js";

interface ApplyBulletInput {
  bulletId?: string;
  text: string;
  plannedLines?: number;
  origin: "grounded" | "agent_augmented";
  evidenceIds?: string[];
  workUnitIds?: string[];
  requirementIds?: string[];
}

interface ComponentExpansionInput {
  bulletId: string;
  component: "context" | "method" | "action" | "result";
  placement: "prepend" | "after" | "append";
  anchor?: string;
  insertText: string;
  contentMode?: "fact_neutral";
}

export interface ApplyResumeContentParameters {
  candidateId: string;
  expectedRevision: number;
  workUnits?: ResumeWorkUnitInput[];
  items?: Array<{
    itemId?: string;
    experienceId?: string;
    bullets: ApplyBulletInput[];
  }>;
  bulletUpdates?: Array<{ bulletId: string; text: string }>;
  bulletRemovals?: Array<{ bulletId: string }>;
  bulletAdditions?: Array<ApplyBulletInput & { itemId: string }>;
  tailGrowths?: Array<{
    bulletId: string;
    growthText: string;
    contentMode?: "fact_neutral";
  }>;
  lineExpansions?: ComponentExpansionInput[];
  lineRewrites?: Array<{
    bulletId: string;
    revisedText: string;
    contentMode?: "fact_neutral";
  }>;
  tailRewrites?: Array<{
    bulletId: string;
    candidates: Array<{
      strategy: "compact" | "expand";
      revisedText: string;
      additionalEvidenceIds?: string[];
      contentMode?: "fact_neutral";
    }>;
  }>;
}

const bullet = Type.Object({
  bulletId: Type.Optional(Type.String({ minLength: 1 })),
  text: Type.String({ minLength: 1 }),
  plannedLines: Type.Optional(Type.Integer({
    minimum: 1,
    description: "该 bullet 按 JD 匹配度与证据深度规划的行数；不限制为 2–3 行，首稿必须提供",
  })),
  origin: Type.Union([
    Type.Literal("grounded"),
    Type.Literal("agent_augmented"),
  ]),
  evidenceIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  workUnitIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  requirementIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
});

const workUnitKind = Type.Union([
  Type.Literal("project"), Type.Literal("report"),
  Type.Literal("initiative"), Type.Literal("responsibility"),
  Type.Literal("deliverable"), Type.Literal("skill_group"),
]);

const componentExpansion = Type.Object({
  bulletId: Type.String({ minLength: 1 }),
  component: Type.Union([
    Type.Literal("context"), Type.Literal("method"),
    Type.Literal("action"), Type.Literal("result"),
  ]),
  placement: Type.Union([
    Type.Literal("prepend"), Type.Literal("after"), Type.Literal("append"),
  ]),
  anchor: Type.Optional(Type.String({ minLength: 1 })),
  insertText: Type.String({ minLength: 1 }),
  contentMode: Type.Optional(Type.Literal("fact_neutral")),
});

const runtimeApplyContentParameters: TSchema = {
  type: "object",
  required: ["candidateId", "expectedRevision"],
  properties: {
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
  workUnits: Type.Optional(Type.Array(Type.Object({
    itemId: Type.String({ minLength: 1 }),
    units: Type.Array(Type.Object({
      label: Type.String({ minLength: 1 }),
      kind: workUnitKind,
      evidenceIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    }), { minItems: 1 }),
  }), {
    minItems: 1,
    description: "仅在 group_work_units 时使用；一次覆盖全部 itemTargets，并把每条 evidence 完整且唯一地归入语义 WorkUnit",
  })),
  items: Type.Optional(Type.Array(Type.Object({
    itemId: Type.Optional(Type.String({ minLength: 1 })),
    experienceId: Type.Optional(Type.String({ minLength: 1 })),
    bullets: Type.Array(bullet),
  }), {
    minItems: 1,
    description: "在 write_item_lines、复用适配或补材整合时使用；一次覆盖全部 itemTargets，并按独立工作单元为每个 item 提交非空完整 bullet 列表；每条可绑定多个同工作单元 evidence；教育信息固定展示，禁止传入",
  })),
  bulletUpdates: Type.Optional(Type.Array(Type.Object({
    bulletId: Type.String({ minLength: 1 }),
    text: Type.String({ minLength: 1 }),
  }), { minItems: 1 })),
  bulletRemovals: Type.Optional(Type.Array(Type.Object({
    bulletId: Type.String({ minLength: 1 }),
  }), {
    minItems: 1,
    maxItems: 1,
    description: "仅在 reduce_overflow.requiredInput=bulletRemovals 时使用；每轮只删除一个 bulletRemovalTargets 中的低价值额外 bullet",
  })),
  bulletAdditions: Type.Optional(Type.Array(Type.Object({
    itemId: Type.String({ minLength: 1 }),
    text: Type.String({ minLength: 1 }),
    origin: Type.Union([
      Type.Literal("grounded"),
      Type.Literal("agent_augmented"),
    ]),
    evidenceIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    workUnitIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    requirementIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  }), {
    minItems: 1,
    description: "在 nextAction 允许 bulletAdditions 时使用；不得和 lineExpansions 同时提交",
  })),
  lineExpansions: Type.Optional(Type.Array(componentExpansion, {
    minItems: 1,
    description: "仅在 increase_usage 时使用；每条选择背景、方法、行动或结果中的一个来源支持部分做一次插入，不得重交完整 bullet",
  })),
  lineRewrites: Type.Optional(Type.Array(Type.Object({
    bulletId: Type.String({ minLength: 1 }),
    revisedText: Type.String({
      minLength: 1,
      description: "仅在页面篇幅阶段提交唯一完整 bullet；尾行阶段必须改用 tailRewrites；不得追加空泛结尾",
    }),
  }), {
    minItems: 1,
    description: "仅在 nextAction 允许 lineRewrites 时使用；每个目标只提交一份 revisedText",
  })),
  tailRewrites: Type.Optional(Type.Array(Type.Object({
    bulletId: Type.String({ minLength: 1 }),
    candidates: Type.Array(Type.Object({
      strategy: Type.Union([
        Type.Literal("compact"), Type.Literal("expand"),
      ]),
      revisedText: Type.String({
        minLength: 1,
        description: "完整、自然且不带句末标点的事实等价 bullet，不是追加尾缀",
      }),
      additionalEvidenceIds: Type.Optional(Type.Array(
        Type.String({ minLength: 1 }),
        {
          description: "候选吸收 availableEvidence 时必须原样引用的新 evidenceId；未用新事实时省略",
        },
      )),
      contentMode: Type.Optional(Type.Literal("fact_neutral", {
        description: "仅在用户结束补充并进入最终收尾后使用；不得加入新事实",
      })),
    }), {
      minItems: 1,
      maxItems: 2,
      description: "最多两份完整改写：compact 调整语序并去除赘词；expand 可吸收 sourceQuotes 或 availableEvidence 的具体事实，新事实必须附 additionalEvidenceIds",
    }),
  }), {
    minItems: 1,
    maxItems: 4,
    description: "仅用于 batch_tail_rewrite；一次覆盖 nextAction.bulletIds 的全部目标",
  })),
  },
};

export const applyContentParameters =
  Unsafe<ApplyResumeContentParameters>(runtimeApplyContentParameters) as
    TUnsafe<ApplyResumeContentParameters> & {
      properties: Record<string, TSchema>;
    };
