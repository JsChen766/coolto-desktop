import { Type } from "@earendil-works/pi-ai";

export const sourceExcerptSchema = Type.Object({
  experienceId: Type.String({ minLength: 1 }),
  revisionId: Type.String({ minLength: 1 }),
  revisionContentHash: Type.String({ minLength: 1 }),
  sourceStart: Type.Integer({ minimum: 0 }),
  sourceEnd: Type.Integer({ minimum: 1 }),
  sourceQuote: Type.String({ minLength: 1 }),
});

export const evidenceBindingSchema = Type.Object({
  bulletId: Type.String({ minLength: 1 }),
  sourceExperienceId: Type.String({ minLength: 1 }),
  bulletText: Type.String({ minLength: 1 }),
  excerpts: Type.Array(sourceExcerptSchema, { minItems: 1, maxItems: 8 }),
  matchedRequirementIds: Type.Array(Type.String({ minLength: 1 }), {
    maxItems: 20,
  }),
});

const addBulletSchema = Type.Object({
  op: Type.Literal("add_bullet"),
  itemId: Type.String({ minLength: 1 }),
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

export const resumePatchOperationSchema = Type.Union([
  addBulletSchema,
  replaceBulletSchema,
  removeBulletSchema,
  moveBulletSchema,
]);
