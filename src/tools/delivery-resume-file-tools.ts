import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { BrowserPageOperator } from "../browser/types.js";
import type { DeliveryResumeFileStore } from
  "../delivery-resume-files/types.js";
import type { SelectedFileRegistry } from
  "../files/selected-file-registry.js";
import { runWriteOperation } from "./browser/write-tool-helpers.js";

const noParameters = Type.Object({});
const selectParameters = Type.Object({
  fileId: Type.String({ minLength: 1, maxLength: 100 }),
});
const uploadParameters = Type.Object({
  fileId: Type.String({ minLength: 1, maxLength: 100 }),
  fillId: Type.String({ minLength: 1, maxLength: 200 }),
});

export function createDeliveryResumeFileTools(
  files: DeliveryResumeFileStore,
  browser?: BrowserPageOperator,
  selectedFiles?: SelectedFileRegistry,
): AgentTool[] {
  const tools: AgentTool[] = [
    {
      name: "list_delivery_resume_files",
      label: "查看用户原始简历",
      description:
        "列出用户原样保存在本机、只用于投递的 PDF/DOCX。它们不属于简历写作资产，" +
        "可由用户指定用于任意岗位，不做相关性判断。",
      parameters: noParameters,
      execute: async () => {
        const items = await files.list();
        return {
          content: [{ type: "text", text: JSON.stringify({
            items,
            instruction:
              "用户指定其中一份时调用 select_delivery_resume_file，然后停止所有简历生成、修改、复用和质量判断。",
          }) }],
          details: items,
        };
      },
    },
    {
      name: "select_delivery_resume_file",
      label: "选择用户原始简历投递",
      description:
        "将用户明确指定的原始文件设为当前首选投递文件。任何岗位均可选择；" +
        "本工具不会生成、修改、解析或关联其它简历。",
      parameters: selectParameters,
      executionMode: "sequential",
      execute: async (_id, input) => {
        const file = await files.setPreferred(
          (input as { fileId: string }).fileId,
        );
        return {
          content: [{ type: "text", text:
            `已选择《${file.title}》用于投递。该文件可用于任意岗位，内容保持原样。` }],
          details: file,
        };
      },
    },
  ];
  if (selectedFiles) tools.push(saveSelectedFileTool(files, selectedFiles));
  if (browser) tools.push(browserUploadTool(files, browser));
  return tools;
}

function saveSelectedFileTool(
  files: DeliveryResumeFileStore,
  selectedFiles: SelectedFileRegistry,
): AgentTool<typeof selectParameters> {
  return {
    name: "save_selected_file_as_delivery_resume",
    label: "原样保存用户简历",
    description:
      "把本轮用户明确上传的 PDF/DOCX 原始字节保存到独立投递文件仓库。" +
      "只用于用户明确说作为原始简历、投递文件或不要修改时；禁止先解析，也不进入简历写作。",
    parameters: selectParameters,
    executionMode: "sequential",
    execute: async (_id, input) => {
      const selected = await selectedFiles.read(input.fileId);
      const saved = await files.importContent(
        selected.metadata.filename,
        selected.content,
      );
      const preferred = await files.setPreferred(saved.id);
      return {
        content: [{
          type: "text",
          text: `已将《${preferred.title}》原样保存为用户原始简历，` +
            "可用于任意岗位；未解析或修改文件内容。",
        }],
        details: preferred,
      };
    },
  };
}

function browserUploadTool(
  files: DeliveryResumeFileStore,
  browser: BrowserPageOperator,
): AgentTool<typeof uploadParameters> {
  return {
    name: "browser_upload_delivery_resume",
    label: "上传用户原始简历",
    description:
      "把已选择的用户原始简历原样挂载到当前网页的原生文件输入框。fileId 必须来自" +
      " list_delivery_resume_files；不向模型或 Renderer 暴露本地路径。需已授予浏览器写权限。",
    parameters: uploadParameters,
    executionMode: "sequential",
    execute: async (_id, input) => {
      const file = await files.get(input.fileId);
      const path = await files.stage(input.fileId);
      return runWriteOperation(
        browser,
        () => browser.uploadFile(input.fillId, [path]),
        (outcome) => ({
          content: [{ type: "text", text: outcome.cancelled
            ? "未挂载用户原始简历。"
            : `已原样挂载《${file.title}》；发送或提交仍遵循当前人工确认规则。` }],
          details: {
            fileId: file.id,
            filename: file.originalFilename,
            sha256: file.sha256,
            uploaded: !outcome.cancelled,
          },
        }),
      );
    },
  };
}
