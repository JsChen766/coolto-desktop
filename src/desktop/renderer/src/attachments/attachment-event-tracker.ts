import type {
  DesktopAgentEvent,
  DesktopAttachment,
  MessageAttachmentStatus,
} from "../../../shared/types.js";
import { translate, translateFormat } from "../i18n/locale.js";

export type AttachmentStatus =
  | "selected"
  | "parsing"
  | "parsed"
  | "partial"
  | "saved"
  | "error";

export interface AttachmentView extends DesktopAttachment {
  status: AttachmentStatus;
  message?: string | undefined;
}

export class AttachmentEventTracker {
  readonly #attachments = new Map<string, AttachmentView>();
  readonly #parseCalls = new Map<
    string,
    { conversationId: string; fileId: string }
  >();
  readonly #importRequests = new Map<
    string,
    { conversationId: string; fileId: string }
  >();
  /** 按 fileId 的实时状态，供消息流里的附件卡片合并展示。 */
  readonly #runtimeStatus = new Map<string, MessageAttachmentStatus>();
  #version = 0;

  public statusFor(
    conversationId: string,
    fileId: string,
  ): MessageAttachmentStatus | undefined {
    return this.#runtimeStatus.get(runtimeKey(conversationId, fileId));
  }

  /** 事件驱动状态变化版本号，UI 用它触发消息卡片重渲染。 */
  public get version(): number {
    return this.#version;
  }

  #setRuntimeStatus(
    conversationId: string,
    fileId: string,
    status: MessageAttachmentStatus,
  ): void {
    this.#runtimeStatus.set(runtimeKey(conversationId, fileId), status);
    this.#version += 1;
  }

  public sync(
    conversationId: string,
    attachment: DesktopAttachment | undefined,
  ): AttachmentView | undefined {
    if (!attachment) {
      this.#attachments.delete(conversationId);
      return undefined;
    }
    const existing = this.#attachments.get(conversationId);
    const view =
      existing?.id === attachment.id
        ? { ...existing, ...attachment }
        : toView(attachment);
    this.#attachments.set(conversationId, view);
    return structuredClone(view);
  }

  public get(conversationId: string): AttachmentView | undefined {
    const attachment = this.#attachments.get(conversationId);
    return attachment ? structuredClone(attachment) : undefined;
  }

  public remove(conversationId: string): void {
    this.#attachments.delete(conversationId);
    for (const key of this.#runtimeStatus.keys()) {
      if (key.startsWith(`${conversationId}:`)) this.#runtimeStatus.delete(key);
    }
  }

  public clear(): void {
    this.#attachments.clear();
    this.#parseCalls.clear();
    this.#importRequests.clear();
    this.#runtimeStatus.clear();
  }

  public handle(
    conversationId: string,
    event: DesktopAgentEvent,
  ): AttachmentView | undefined {
    if (event.type === "tool.started" && event.name === "parse_selected_file") {
      const fileId = argumentFileId(event.arguments);
      if (!fileId) return this.get(conversationId);
      this.#parseCalls.set(event.callId, { conversationId, fileId });
      this.#setRuntimeStatus(conversationId, fileId, "parsing");
      this.#update(conversationId, fileId, {
        status: "parsing",
        message: undefined,
      });
    } else if (
      event.type === "tool.completed" &&
      event.name === "parse_selected_file"
    ) {
      const selected = this.#parseCalls.get(event.callId);
      this.#parseCalls.delete(event.callId);
      if (selected) {
        this.#setRuntimeStatus(
          selected.conversationId,
          selected.fileId,
          event.isError ? "error" : "parsed",
        );
        this.#update(selected.conversationId, selected.fileId, {
          status: event.isError ? "error" : "parsed",
          message: event.isError
            ? translate("解析失败，请查看上方错误并重试")
            : undefined,
        });
      }
    } else if (
      event.type === "approval.required" &&
      event.request.actionType === "experience.import"
    ) {
      const selected = this.#attachments.get(conversationId);
      if (
        selected &&
        ["parsed", "partial", "error"].includes(selected.status)
      ) {
        this.#importRequests.set(event.request.id, {
          conversationId,
          fileId: selected.id,
        });
      }
    } else if (
      event.type === "approval.resolved" &&
      event.decision !== "accept"
    ) {
      this.#importRequests.delete(event.requestId);
    } else if (event.type === "approval.completed") {
      const selected = this.#importRequests.get(event.requestId);
      this.#importRequests.delete(event.requestId);
      if (selected) {
        const failed = failedImportCount(event.details);
        this.#setRuntimeStatus(
          selected.conversationId,
          selected.fileId,
          failed > 0 ? "partial" : "saved",
        );
        this.#update(selected.conversationId, selected.fileId, {
          status: failed > 0 ? "partial" : "saved",
          message:
            failed > 0
              ? translateFormat("{failed} 条经历写入失败，可继续重试", { failed })
              : undefined,
        });
      }
    } else if (event.type === "approval.failed") {
      const selected = this.#importRequests.get(event.requestId);
      this.#importRequests.delete(event.requestId);
      if (selected) {
        this.#setRuntimeStatus(selected.conversationId, selected.fileId, "error");
        this.#update(selected.conversationId, selected.fileId, {
          status: "error",
          message: event.message,
        });
      }
    } else if (event.type === "run.failed") {
      this.#finishInterruptedParses(conversationId, event.message);
    } else if (event.type === "run.completed") {
      this.#finishInterruptedParses(
        conversationId,
        translate("附件解析未完成，可重新发送后重试"),
      );
    }
    return this.get(conversationId);
  }

  #finishInterruptedParses(conversationId: string, message: string): void {
    for (const [callId, selected] of this.#parseCalls) {
      if (selected.conversationId !== conversationId) continue;
      this.#parseCalls.delete(callId);
      this.#setRuntimeStatus(selected.conversationId, selected.fileId, "error");
      this.#update(conversationId, selected.fileId, {
        status: "error",
        message,
      });
    }
  }

  #update(
    conversationId: string,
    fileId: string,
    patch: Pick<AttachmentView, "status" | "message">,
  ): void {
    const selected = this.#attachments.get(conversationId);
    if (!selected || selected.id !== fileId) return;
    const updated = { ...selected, ...patch };
    if (updated.message === undefined) delete updated.message;
    this.#attachments.set(conversationId, updated);
  }
}

function toView(value: DesktopAttachment): AttachmentView {
  return { ...value, status: "selected" };
}

function argumentFileId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const fileId = (value as { fileId?: unknown }).fileId;
  return typeof fileId === "string" ? fileId : undefined;
}

function failedImportCount(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const failed = (value as { failed?: unknown }).failed;
  return Array.isArray(failed) ? failed.length : 0;
}

function runtimeKey(conversationId: string, fileId: string): string {
  return `${conversationId}:${fileId}`;
}
