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
    description: "首稿或补齐 bullet 数量时使用；repair_bullet_depth 和 reduce_overflow 禁止使用 items",
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
    revisedText: Type.Optional(Type.String({
      minLength: 1,
      description: "按 editInstruction.characterDelta 将 currentText 自然重写到 targetCharacters 左右的唯一完整 bullet；保留事实与数字并自动沿用 evidenceIds，禁止在句末堆抽象效果词",
    })),
    augmentedModifier: Type.Optional(Type.Object({
      text: Type.String({ minLength: 1 }),
      requirementIds: Type.Array(
        Type.String({ minLength: 1 }),
        { minItems: 1 },
      ),
    })),
  }), {
    minItems: 1,
    description: "完整覆盖 nextAction.bulletIds；每目标只交 revisedText 或 augmentedModifier 之一，未达标但更接近的 revisedText 会成为下一轮 currentText",
  })),
  lineRewrites: Type.Optional(Type.Array(Type.Object({
    bulletId: Type.String({ minLength: 1 }),
    revisedText: Type.String({
      minLength: 1,
      description: "把 currentText 自然整句改写到 targetCharacters 左右的唯一完整 bullet；必须保留可靠事实和数字，不得追加空泛结尾",
    }),
  }), {
    minItems: 1,
    description: "在 nextAction 允许 lineRewrites 时使用；repair_bullet_depth 必须一次覆盖全部 lineRewriteTargets，increase_usage 覆盖本轮 lineExpansionTargets；每目标只提交一份 revisedText，未跨行但有效变长的文本会立即应用并成为下一轮基线",
  })),
});
