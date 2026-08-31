import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ManagedResumeUploadService } from
  "../desktop/main/agent-task/managed-resume-upload-service.js";

const parameters = Type.Object({
  fillId: Type.String({ minLength: 1, maxLength: 200 }),
});

export function createManagedResumeUploadTool(
  uploads: ManagedResumeUploadService,
  conversationId: string,
): AgentTool<typeof parameters> {
  return {
    name: "browser_upload_frozen_resume",
    label: "上传已选简历 PDF",
    description:
      "把当前 DelegationGrant 冻结的 passed Resume 编译为同版本单页 PDF，" +
      "挂载到当前原生文件输入框。不会向模型或 Renderer 暴露路径；任务结束后自动清理。",
    parameters,
    executionMode: "sequential",
    execute: async (_id, input) => {
      const result = await uploads.upload(conversationId, input.fillId);
      return {
        content: [{ type: "text", text: result.uploaded
          ? `已挂载《${result.filename}》；最终提交仍需逐岗位确认。`
          : "未挂载简历 PDF。" }],
        details: result,
      };
    },
  };
}
