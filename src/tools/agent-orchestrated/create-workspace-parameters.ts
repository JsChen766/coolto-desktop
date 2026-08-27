import { Type } from "@earendil-works/pi-ai";

const namedTier = Type.Union([
  Type.Literal("main"),
  Type.Literal("secondary"),
  Type.Literal("utility"),
]);
const tier = Type.Union([
  namedTier,
  Type.String({
    minLength: 1,
    description: "只允许 main、secondary、utility；教育和明确 skills 来源请省略 tier",
  }),
  Type.Null(),
]);

export const createWorkspaceParameters = Type.Object({
  jdId: Type.String({ minLength: 1 }),
  baseResumeId: Type.Optional(Type.String({
    minLength: 1,
    description: "仅使用 find_resume_reuse_candidates/get_resume 核验后由 Agent 选择的历史 Resume ID",
  })),
  baseDraftArtifactId: Type.Optional(Type.String({
    minLength: 1,
    description: "仅使用 find_resume_reuse_candidates/get_resume 核验后的合格本地 ResumeDraft artifactId",
  })),
  language: Type.Union([Type.Literal("zh-CN"), Type.Literal("en-US")]),
  experiences: Type.Array(Type.Object({
    experienceId: Type.String({
      description: "原样使用 search_experiences 返回的 exp_... 短 id",
      minLength: 1,
    }),
    tier: Type.Optional(tier),
    localizedPosition: Type.Optional(Type.String({
      minLength: 1,
      maxLength: 100,
      description: "工作经历按 language 翻译出的单一目标语言职位名",
    })),
  }), { minItems: 1 }),
  educationCoursework: Type.Optional(Type.Array(Type.Object({
    experienceId: Type.String({
      minLength: 1,
      description: "对应教育经历的短 id；没有明确课程的教育经历不要提交",
    }),
    sourceQuote: Type.String({
      minLength: 1,
      description: "逐字复制包含全部所列课程名的原始教育经历片段",
    }),
    courses: Type.Array(Type.String({ minLength: 1, maxLength: 120 }), {
      minItems: 1,
      description: "sourceQuote 中明确出现的课程名称；保持原语言，不翻译",
    }),
  }))),
});
