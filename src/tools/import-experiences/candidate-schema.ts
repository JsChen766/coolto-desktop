import { Type } from "@earendil-works/pi-ai";

const categorySchema = Type.Union([
  Type.Literal("work"),
  Type.Literal("project"),
  Type.Literal("education"),
  Type.Literal("volunteer"),
  Type.Literal("other"),
]);

export const importCandidateSchema = Type.Object({
  category: categorySchema,
  title: Type.String({ minLength: 1, maxLength: 300 }),
  content: Type.String({
    minLength: 1,
    maxLength: 30_000,
    description:
      "保留事实、指标、技术名和每条要点，不要补充原文中没有的内容。",
  }),
  organization: Type.Optional(Type.String({ maxLength: 300 })),
  role: Type.Optional(Type.String({ maxLength: 300 })),
  location: Type.Optional(Type.String({ maxLength: 300 })),
  startDate: Type.Optional(
    Type.String({
      description: "YYYY-MM 或 YYYY-MM-DD；未知时省略。",
    }),
  ),
  endDate: Type.Optional(
    Type.String({
      description: "YYYY-MM、YYYY-MM-DD 或 present；未知时省略。",
    }),
  ),
  tags: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 100 }), {
      maxItems: 20,
    }),
  ),
  resumeSection: Type.Optional(Type.Object({
    key: Type.String({ minLength: 1, maxLength: 64 }),
    label: Type.String({ minLength: 1, maxLength: 120 }),
  })),
});
