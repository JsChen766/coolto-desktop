import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type {
  ExperienceCategory,
  ExperienceRevision,
  ExperienceReader,
  ExperienceSummary,
} from "../api/types.js";
import { experienceEvidenceEligibility } from
  "../experience/evidence-eligibility.js";

const EXPERIENCE_CATEGORIES = [
  "work",
  "project",
  "education",
  "volunteer",
  "other",
] as const satisfies readonly ExperienceCategory[];

const parameters = Type.Object({
  q: Type.Optional(
    Type.String({
      description:
        "可选关键词，会搜索标题、组织、角色和当前经历正文。不要把整句用户请求原样放进来。",
      minLength: 1,
    }),
  ),
  category: Type.Optional(
    Type.Union(
      EXPERIENCE_CATEGORIES.map((category) => Type.Literal(category)),
      {
        description:
          "可选经历类别：work 工作、project 项目、education 教育、volunteer 志愿、other 其他。",
      },
    ),
  ),
  tags: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), {
      description: "可选标签列表；结果必须同时包含这些标签。",
      maxItems: 10,
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      description: "返回数量，默认 20，最大 100。",
      minimum: 1,
      maximum: 100,
    }),
  ),
  cursor: Type.Optional(
    Type.String({
      description: "继续分页时传入上一次结果的 nextCursor。",
      minLength: 1,
    }),
  ),
});

export function createSearchExperiencesTool(
  experienceReader: ExperienceReader,
): AgentTool<typeof parameters> {
  return {
    name: "search_experiences",
    label: "搜索经历",
    description:
      "列出或筛选当前登录用户的经历库，并返回语义判断所需的当前正文。模型看到的 id 是 exp_... 形式的跨重启稳定短引用，后续工具必须原样使用，不要抄写或猜测底层 UUID。需要历史版本或单条完整详情时，再使用 get_experience。",
    parameters,
    execute: async (_toolCallId, params, signal) => {
      const result = await experienceReader.searchExperiences(params, signal);
      const items = result.items.filter(
        (item) => experienceEvidenceEligibility(item).eligible,
      );
      const modelResult = {
        nextCursor: result.nextCursor,
        items: items.map(projectExperienceForModel),
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(modelResult),
          },
        ],
        details: { ...result, items },
      };
    },
  };
}

function projectExperienceForModel(item: ExperienceSummary) {
  const runtimeRevisions = (item as ExperienceSummary & {
    revisions?: ExperienceRevision[];
  }).revisions;
  const currentContent = item.currentRevision?.content ??
    runtimeRevisions?.find((revision) => revision.id === item.currentRevisionId)
      ?.content ??
    runtimeRevisions?.at(-1)?.content ?? null;
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    organization: item.organization,
    role: item.role,
    location: item.location,
    startDate: item.startDate,
    endDate: item.endDate,
    tags: item.tags,
    resumeSectionKey: item.resumeSectionKey ?? null,
    resumeSectionLabel: item.resumeSectionLabel ?? null,
    currentContent,
  };
}
