import type { WebContents } from "electron";

import type { FileUploadOutcome } from "../../../browser/types.js";
import { probeFileInput, setFileInputFiles } from "./browser-file-uploader.js";

export async function uploadPageFile(
  contents: WebContents,
  fillId: string,
  picker: {
    pick(options: { accept: string; multiple: boolean }): Promise<string[]>;
  },
  touch: () => void,
): Promise<FileUploadOutcome> {
  const probe = await probeFileInput(contents, fillId);
  if (!probe.ok) throw new Error(uploadReason(probe.reason));
  const paths = await picker.pick({
    accept: probe.accept,
    multiple: probe.multiple,
  });
  if (paths.length === 0) return { cancelled: true };
  const result = await setFileInputFiles(contents, fillId, paths);
  touch();
  return {
    cancelled: false,
    filenames: paths.map((path) => path.split(/[\\/]/u).pop() ?? path),
    fileCount: result.fileCount,
  };
}

function uploadReason(reason: string | undefined): string {
  if (reason === "element_not_found") {
    return "目标元素不存在（element_not_found）";
  }
  if (reason === "not_file_input") {
    return "目标不是原生 <input type=file>，无法上传；请提示用户手动上传附件";
  }
  if (reason === "element_disabled") {
    return "目标文件输入框已禁用（element_disabled）";
  }
  return reason ?? "文件上传失败";
}
