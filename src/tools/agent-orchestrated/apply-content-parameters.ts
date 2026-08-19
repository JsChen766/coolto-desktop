import { Type } from "@earendil-works/pi-ai";

const bullet = Type.Object({
  bulletId: Type.Optional(Type.String({ minLength: 1 })),
  text: Type.String({ minLength: 1 }),
  origin: Type.Union([
    Type.Literal("grounded"),
    Type.Literal("agent_augmented"),
  ]),
  evidenceIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  requirementIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
});

export const applyContentParameters = Type.Object({
  candidateId: Type.String({ minLength: 1 }),
  expectedRevision: Type.Integer({ minimum: 0 }),
  items: Type.Optional(Type.Array(Type.Object({
    itemId: Type.Optional(Type.String({ minLength: 1 })),
    experienceId: Type.Optional(Type.String({ minLength: 1 })),
    bullets: Type.Array(bullet),
  }), {
    minItems: 1,
    description: "仅在 repair_bullet_counts 时使用；一次覆盖全部 itemTargets，并为每个 item 提交完整 bullet 列表，不得提交候选版本；教育信息固定展示，禁止传入",
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
    requirementIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  }), {
    minItems: 1,
    description: "在 nextAction 允许 bulletAdditions 时使用；不得和 lineRewrites 同时提交",
  })),
  tailRepairs: Type.Optional(Type.Array(Type.Object({
    bulletId: Type.String({ minLength: 1 }),
    revisedText: Type.String({
      minLength: 1,
      description: "执行目标 requiredEdit，参考建议新增字数与具体事实提示，基于 currentText 返回唯一完整扩写 bullet；允许重组语序，但必须保留事实和数字；原样或更短返回失败",
    }),
  }), {
    minItems: 1,
    description: "一次覆盖 nextAction.bulletIds 的全部目标；每条基于 currentText 批量语义扩写并新增一个来源支持的具体事实短语，只提交唯一完整 revisedText；不接受原文、备选、片段或多版本",
  })),
  lineRewrites: Type.Optional(Type.Array(Type.Object({
    bulletId: Type.String({ minLength: 1 }),
    revisedText: Type.String({
      minLength: 1,
      description: "把 currentText 自然整句改写到 targetCharacters 左右的唯一完整 bullet；必须保留可靠事实和数字，不得追加空泛结尾",
    }),
  }), {
    minItems: 1,
    description: "在 nextAction 允许 lineRewrites 时使用；repair_bullet_depth 必须一次覆盖全部目标；每个目标只提交一份 revisedText",
  })),
});
