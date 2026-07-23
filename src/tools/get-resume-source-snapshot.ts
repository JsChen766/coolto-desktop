import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { projectResumeSourceSnapshot } from "../resume/source-projection.js";
import type { ResumeSourceSnapshotBuilder } from "../resume/source-snapshot.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../resume/template-contract.js";

const parameters = Type.Object({
  jdId: Type.String({
    minLength: 1,
    description: "已经确认的目标 JD ID。",
  }),
  experienceIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    maxItems: 50,
    description: "已经确认要纳入候选范围的经历 ID，不能猜测。",
  }),
});

export function createGetResumeSourceSnapshotTool(
  builder: ResumeSourceSnapshotBuilder,
): AgentTool<typeof parameters> {
  return {
    name: "get_resume_source_snapshot",
    label: "锁定简历来源",
    description:
      "在目标 JD 和经历范围已经明确后，读取 profile、完整 JD 和各经历 currentRevision，并冻结一次只读来源快照。该工具不生成或保存简历；后续证据应直接复制返回的 availableEvidence 精确 quote 和 UTF-16 offsets，不要自行计算。",
    parameters,
    execute: async (_toolCallId, params, signal) => {
      const snapshot = await builder.build(
        {
          jdId: params.jdId,
          experienceIds: params.experienceIds,
          template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
        },
        signal,
      );
      const projection = projectResumeSourceSnapshot(snapshot);
      return {
        content: [{ type: "text", text: JSON.stringify(projection) }],
        details: snapshot,
      };
    },
  };
}
