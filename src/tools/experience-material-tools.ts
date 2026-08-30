import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ExperienceReader } from "../api/types.js";
import type { ExperienceMaterialIngestionStore } from
  "../experience/material-ingestion-store.js";
import type { ExperienceMaterialSource } from
  "../experience/material-ingestion-types.js";

const category = Type.Union([
  Type.Literal("work"), Type.Literal("project"), Type.Literal("education"),
  Type.Literal("volunteer"), Type.Literal("other"),
]);

const target = Type.Union([
  Type.Object({
    kind: Type.Literal("existing"),
    experienceId: Type.String({ minLength: 1 }),
  }),
  Type.Object({
    kind: Type.Literal("new"),
    category,
    title: Type.String({ minLength: 1, maxLength: 200 }),
    organization: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
    role: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
    location: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
    startDate: Type.Union([Type.String(), Type.Null()]),
    endDate: Type.Union([Type.String(), Type.Null()]),
    tags: Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 40 }),
  }),
]);

const beginParameters = Type.Object({
  source: Type.Union([
    Type.Object({ kind: Type.Literal("file"), fileId: Type.String({ minLength: 1 }),
      selectedTexts: Type.Optional(Type.Array(
        Type.String({ minLength: 1, maxLength: 20_000 }), { minItems: 1, maxItems: 100 },
      )) }),
    Type.Object({ kind: Type.Literal("web"),
      selectedTexts: Type.Optional(Type.Array(
        Type.String({ minLength: 1, maxLength: 20_000 }), { minItems: 1, maxItems: 100 },
      )) }),
    Type.Object({ kind: Type.Literal("text"),
      selectedTexts: Type.Optional(Type.Array(
        Type.String({ minLength: 1, maxLength: 20_000 }), { minItems: 1, maxItems: 100 },
      )) }),
  ]),
  target,
});

const recordParameters = Type.Object({
  sessionId: Type.String({ minLength: 1 }),
  chunkId: Type.String({ minLength: 1 }),
  detailedText: Type.String({ minLength: 1, maxLength: 20_000 }),
  coveredCriticalTexts: Type.Array(Type.String({ minLength: 1 }), { maxItems: 500 }),
});

export function createExperienceMaterialTools(input: {
  store: ExperienceMaterialIngestionStore;
  experiences: ExperienceReader;
}): AgentTool[] {
  const begin: AgentTool<typeof beginParameters> = {
    name: "begin_experience_material_ingestion",
    label: "开始沉淀经历材料",
    description:
      "用户上传的文件或明确指定的当前网页需要尽可能完整写入经历仓库时使用。先搜索现有经历；用户指定或可靠匹配时使用 existing，否则用材料主题创建 new。" +
      "文件或网页只对应当前目标经历时可不传 selectedTexts；source.kind=text 时 selectedTexts 永远必填，必须把属于当前目标的全部连续原文片段逐字放入，宿主会验证每段确实存在于固定原文，避免把聊天指令或其他经历串入。" +
      "缺少直接文本片段时宿主返回 accepted=false，不会写入；补齐后重试。本工具固定材料快照并返回第一个分块、数字清单、关键产出候选和最低详细度。之后必须逐块调用 record_experience_material_chunk，直到宿主返回 done=true。",
    executionMode: "sequential",
    parameters: beginParameters,
    execute: async (_callId, params) => {
      if (params.source.kind === "text" && !params.source.selectedTexts?.length) {
        return receipt({
          accepted: false,
          errorCode: "selected_text_required",
          message: "直接聊天文本必须逐字提交属于目标经历的全部原文片段",
        });
      }
      if (params.target.kind === "existing") {
        await input.experiences.getExperience(params.target.experienceId);
      }
      const result = await input.store.begin(
        params.source as ExperienceMaterialSource,
        params.target,
      );
      return receipt(result);
    },
  };

  const record: AgentTool<typeof recordParameters> = {
    name: "record_experience_material_chunk",
    label: "记录经历材料分块",
    description:
      "把当前材料分块整理成尽可能详细的自然文本。不得按简历篇幅删减；所有宿主列出的数字必须出现在 detailedText，所有 criticalTexts 必须原样列入 coveredCriticalTexts。" +
      "criticalTexts 的全部原始信息也必须在 detailedText 中实质保留；最低字符数只是拒绝明显过度压缩的底线，不是总结目标。" +
      "宿主未接受时按 missingNumbers/missingCriticalTexts 补全同一块；接受后立即处理返回的下一块。done=true 表示宿主已一次写入 Experience 正文和一个 revision。",
    executionMode: "sequential",
    parameters: recordParameters,
    execute: async (_callId, params) => receipt(await input.store.record(params)),
  };
  return [begin, record];
}

function receipt(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    details: value,
  };
}
