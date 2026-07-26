import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { BrowserPageOperator } from "../../browser/types.js";
import { runWriteOperation } from "./write-tool-helpers.js";

const parameters = Type.Object({
  fillId: Type.String({
    minLength: 1,
    maxLength: 200,
    description: "由 browser_tag_elements 返回的 <input type=file> 元素 fillId。",
  }),
});

/**
 * B5: 向原生 `<input type=file>` 上传本地文件（如简历 PDF 附件）。
 * 调用后弹出系统文件选择框，由用户手动选取文件（Agent 无法指定任意本地路径），
 * 选中后经 CDP DOM.setFileInputFiles 注入。用户取消选择时返回提示而非错误。
 * 需已授予写权限；非原生 file input 时返回 isError，应提示用户手动上传。
 */
export function createBrowserUploadFileTool(
  operator: BrowserPageOperator,
): AgentTool<typeof parameters> {
  return {
    name: "browser_upload_file",
    label: "上传文件附件",
    description:
      "向原生 <input type=file> 上传本地文件（如简历 PDF）。调用后会弹出系统文件" +
      "选择框，由用户手动选取文件——你不能也不需要提供本地路径。fillId 由 " +
      "browser_tag_elements 返回。若目标不是原生文件输入框会返回 isError，此时" +
      "应提示用户手动上传附件。需已授予写权限。",
    parameters,
    execute: async (_toolCallId, params) =>
      runWriteOperation(
        operator,
        () => operator.uploadFile(params.fillId),
        (outcome) =>
          outcome.cancelled
            ? {
                content: [
                  {
                    type: "text",
                    text: "用户取消了文件选择，未上传任何附件。",
                  },
                ],
                details: { fillId: params.fillId, cancelled: true },
              }
            : {
                content: [
                  {
                    type: "text",
                    text:
                      `已上传 ${outcome.fileCount} 个文件到字段 ${params.fillId}：` +
                      outcome.filenames.join("、"),
                  },
                ],
                details: {
                  fillId: params.fillId,
                  cancelled: false,
                  fileCount: outcome.fileCount,
                  filenames: outcome.filenames,
                },
              },
      ),
  };
}
