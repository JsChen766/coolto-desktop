import type { MessageAttachment, MessageAttachmentStatus } from "@desktop/types";
import { translate } from "../i18n/locale";
import type { AttachmentView } from "./attachment-event-tracker";

export type AttachmentLike = { status: MessageAttachmentStatus | "selected" };

/** AttachmentView → MessageAttachment（乐观消息快照）；本地
 * "selected" 映射为运行时 "pending"。 */
export function toMessageAttachment(view: AttachmentView): MessageAttachment {
  return {
    fileId: view.id,
    filename: view.filename,
    type: view.type,
    sizeBytes: view.sizeBytes,
    status: view.status === "selected" ? "pending" : view.status,
  };
}

export function attachmentStatus(view: AttachmentLike): string {
  if (view.status === "parsing") return translate("解析中");
  if (view.status === "parsed") return translate("已解析");
  if (view.status === "partial") return translate("部分已保存");
  if (view.status === "saved") return translate("经历已保存，等待同步");
  if (view.status === "error") return translate("处理失败");
  return translate("已选择");
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
