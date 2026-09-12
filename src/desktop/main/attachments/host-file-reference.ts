import type { SelectedFileMetadata } from "../../../files/types.js";
import { SelectedFileRegistry } from "../../../files/selected-file-registry.js";

export const ATTACHMENT_CAPTURE_IPC_CHANNEL = "attachments:capture-file";
export const ATTACHMENT_IPC_CHANNELS = [
  "attachments:list",
  "attachments:select",
  ATTACHMENT_CAPTURE_IPC_CHANNEL,
  "attachments:remove",
] as const;

/** Captures an immutable byte snapshot in the host-owned registry. */
export async function captureHostFileReference(
  registry: SelectedFileRegistry,
  inputPath: string,
): Promise<SelectedFileMetadata> {
  const [metadata] = await registry.replacePaths([inputPath]);
  if (!metadata) throw new Error("文件选择器没有返回附件");
  return metadata;
}
