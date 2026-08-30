import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { BrowserAgentController } from "../../browser/agent-control-types.js";
import { browserControlResult } from "./browser-control-result.js";

const parameters = Type.Object({
  url: Type.String({ minLength: 1, maxLength: 4096 }),
  filenamePart: Type.Optional(Type.String({ maxLength: 300 })),
  timeoutMs: Type.Optional(Type.Number({ minimum: 100, maximum: 30_000 })),
});

export function createBrowserDownloadTool(
  controller: BrowserAgentController,
): AgentTool<typeof parameters> {
  return {
    name: "browser_download",
    label: "下载浏览器文件",
    description:
      "从完整 HTTP(S) URL 发起受控下载并等待结果。调用前必须 request_write_access。" +
      "只向 Agent 返回文件名、来源 URL、字节数和完成状态，永不返回本机保存路径；" +
      "需要后续上传时仍由 browser_upload_file 弹出系统选择器让用户亲自选择。",
    parameters,
    execute: async (_id, input, signal) => browserControlResult(() =>
      controller.download(
        input.url,
        input.filenamePart,
        input.timeoutMs,
        signal,
      ),
    ),
  };
}
