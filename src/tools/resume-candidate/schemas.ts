import { Type } from "@earendil-works/pi-ai";

export const evidenceBindingSchema = Type.Object({
  bulletText: Type.String({
    minLength: 1,
    description:
      "bullet 正文：把来源中的动作、对象、方法、范围或结果组织为完整事实句；所有数字必须逐字等价地存在于所引用的证据原文中。bulletId 与 sourceExperienceId 由宿主自动生成，不要提供。",
  }),
  evidenceIds: Type.Array(
    Type.String({
      minLength: 1,
      description:
        "从 availableEvidence 中逐字复制的稳定证据 ID，格式为 experienceId:sourceStart:sourceEnd。禁止自行构造、拼接、改写 quote 或计算 offset；需要多句证据时使用多个完整 evidenceId；全部必须属于同一经历。",
    }),
    { minItems: 1, maxItems: 8 },
  ),
});

const addBulletSchema = Type.Object({
  op: Type.Literal("add_bullet"),
  itemId: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "可选：目标 item 的稳定 ID（来自 Workspace structure）；省略时宿主按证据所属经历自动定位。",
    }),
  ),
  afterBulletId: Type.Optional(
    Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  ),
  binding: evidenceBindingSchema,
});

const replaceBulletSchema = Type.Object({
  op: Type.Literal("replace_bullet"),
  bulletId: Type.String({ minLength: 1 }),
  binding: evidenceBindingSchema,
});

const removeBulletSchema = Type.Object({
  op: Type.Literal("remove_bullet"),
  bulletId: Type.String({ minLength: 1 }),
});

const moveBulletSchema = Type.Object({
  op: Type.Literal("move_bullet"),
  bulletId: Type.String({ minLength: 1 }),
  afterBulletId: Type.Optional(
    Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  ),
});

const evidenceIdsField = Type.Array(
  Type.String({
    minLength: 1,
    description:
      "从 availableEvidence 中逐字复制的稳定证据 ID，格式为 experienceId:sourceStart:sourceEnd；新增文本中的每个数字都必须存在于这些证据中，且证据必须属于该 bullet 所在经历。",
  }),
  { minItems: 1, maxItems: 8 },
);

const appendTextSchema = Type.Object({
  op: Type.Literal("append_text"),
  bulletId: Type.String({ minLength: 1 }),
  text: Type.String({
    minLength: 1,
    description: "追加到 bullet 末尾的增量文本，约 10–80 字符，必须为完整事实片段。",
  }),
  evidenceIds: evidenceIdsField,
});

const prependTextSchema = Type.Object({
  op: Type.Literal("prepend_text"),
  bulletId: Type.String({ minLength: 1 }),
  text: Type.String({ minLength: 1 }),
  evidenceIds: evidenceIdsField,
});

const insertTextSchema = Type.Object({
  op: Type.Literal("insert_text"),
  bulletId: Type.String({ minLength: 1 }),
  after: Type.String({
    minLength: 1,
    description:
      "目标 bullet 当前文本中恰好出现一次的子串（从 visibleText 逐字复制），在其后插入 text。",
  }),
  text: Type.String({ minLength: 1 }),
  evidenceIds: evidenceIdsField,
});

const replaceSubstringSchema = Type.Object({
  op: Type.Literal("replace_substring"),
  bulletId: Type.String({ minLength: 1 }),
  from: Type.String({
    minLength: 1,
    description: "目标 bullet 当前文本中恰好出现一次的子串（从 visibleText 逐字复制）。",
  }),
  to: Type.String({
    description: "替换后的文本；新内容中的数字必须存在于 evidenceIds 对应证据中，可省略 to 以删除子串。",
  }),
  evidenceIds: evidenceIdsField,
});

const trimTextSchema = Type.Object({
  op: Type.Literal("trim_text"),
  bulletId: Type.String({ minLength: 1 }),
  keepChars: Type.Integer({
    minimum: 1,
    description: "保留 bullet 前 N 个 Unicode 字符（含标点），用于缩短过长 bullet。",
  }),
});

export const resumePatchOperationSchema = Type.Union([
  addBulletSchema,
  replaceBulletSchema,
  removeBulletSchema,
  moveBulletSchema,
  appendTextSchema,
  prependTextSchema,
  insertTextSchema,
  replaceSubstringSchema,
  trimTextSchema,
]);

export const alternativeTargetSchema = Type.Object({
  targetId: Type.String({ minLength: 1 }),
  alternatives: Type.Array(
    Type.Object({
      label: Type.Optional(Type.String({ maxLength: 120 })),
      operations: Type.Array(resumePatchOperationSchema, {
        minItems: 1,
        maxItems: 3,
      }),
    }),
    { minItems: 1, maxItems: 3 },
  ),
});
