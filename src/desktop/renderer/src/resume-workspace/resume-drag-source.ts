import { GripVertical } from "@lucide/vue";
import { h, render } from "vue";

import type { ResumeChatReference } from "@desktop/types";
import { publishResumeReference } from "./resume-reference-channel";
import { translate } from "../i18n/locale";

export type ResumeDragSourceKind = "bullet" | "item";

export function addResumeDragHandle(
  container: HTMLElement,
  reference: ResumeChatReference,
  kind: ResumeDragSourceKind,
): void {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.draggable = true;
  handle.className = `resume-drag-handle resume-drag-handle--${kind}`;
  handle.ariaLabel = translate(kind === "bullet" ? "拖动此要点到聊天" : "拖动此经历到聊天");
  handle.title = translate("拖到聊天区让 AI 修改；点击也可直接引用");
  render(
    h(GripVertical, {
      size: 14,
      strokeWidth: 1.8,
      "aria-hidden": "true",
    }),
    handle,
  );
  handle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    publishResumeReference(reference);
  });
  handle.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    event.dataTransfer?.setData(
      "application/x-coolto-resume-reference",
      JSON.stringify(reference),
    );
    event.dataTransfer?.setData("text/plain", reference.label);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    container.classList.add("resume-dragging-source");
  });
  handle.addEventListener("dragend", () => {
    container.classList.remove("resume-dragging-source");
  });
  container.classList.add("resume-has-drag-handle");
  container.append(handle);
}
