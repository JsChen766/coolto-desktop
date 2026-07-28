import type { AttachmentView } from "./use-conversation-attachment";

export function attachmentStatus(view: AttachmentView): string {
  if (view.status === "parsing") return "解析中";
  if (view.status === "parsed") return "已解析";
  if (view.status === "partial") return "部分已保存";
  if (view.status === "saved") return "经历已保存，等待同步";
  if (view.status === "error") return "处理失败";
  return "已选择";
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
