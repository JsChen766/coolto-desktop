import { ref, type Ref } from "vue";

import type { ResumeChatReference, ResumeDraftDetail } from "@desktop/types";
import { publishResumeReference } from "./resume-reference-channel";
import { translate } from "../i18n/locale";

interface LockedPopover {
  left: number;
  top: number;
  reference: ResumeChatReference;
}

export function useResumeLockPopover(
  viewport: Ref<HTMLElement | undefined>,
  draft: () => ResumeDraftDetail,
) {
  const locked = ref<LockedPopover>();

  function makeLocked(element: HTMLElement): void {
    if (element.classList.contains("resume-editable-text")) return;
    element.classList.add("resume-locked-field");
    element.tabIndex = 0;
    element.title = translate("此内容来自固定资产");
    const show = () => showLockedExplanation(element);
    element.addEventListener("click", show);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        show();
      }
    });
  }

  function showLockedExplanation(element: HTMLElement): void {
    const container = viewport.value;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const itemId = element.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const sectionId = element.closest<HTMLElement>("[data-section-id]")?.dataset.sectionId;
    locked.value = {
      left: Math.max(
        12,
        Math.min(container.clientWidth - 264, rect.left - containerRect.left),
      ),
      top: Math.max(12, rect.bottom - containerRect.top + 8),
      reference: {
        artifactId: draft().artifactId,
        targetType: "locked_field",
        targetId: itemId ?? sectionId ?? "contact",
        label: element.innerText.trim().slice(0, 64) || translate("固定信息"),
      },
    };
  }

  function sendLockedToChat(): void {
    if (!locked.value) return;
    publishResumeReference(locked.value.reference);
    locked.value = undefined;
  }

  return { locked, makeLocked, sendLockedToChat };
}
