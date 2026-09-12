import { shallowRef } from "vue";

import type { ResumeChatReference } from "../../../shared/types.js";

interface ComposerDropOptions {
  selectAttachmentFile(file: File): void;
  selectResumeReference(reference: ResumeChatReference): void;
}

export function useComposerDrop(options: ComposerDropOptions) {
  const dragActive = shallowRef(false);

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    dragActive.value = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      selectFile(file);
      return;
    }
    const encoded = event.dataTransfer?.getData(
      "application/x-coolto-resume-reference",
    );
    if (!encoded) return;
    try {
      const reference = JSON.parse(encoded) as unknown;
      if (isResumeReference(reference)) {
        options.selectResumeReference(reference);
      }
    } catch {
      return;
    }
  }

  function handleFileInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (file) selectFile(file);
    if (input) input.value = "";
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    dragActive.value = true;
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent): void {
    const container = event.currentTarget as HTMLElement | null;
    const related = event.relatedTarget as Node | null;
    if (!container || !related || !container.contains(related)) {
      dragActive.value = false;
    }
  }

  function selectFile(file: File): void {
    options.selectAttachmentFile(file);
  }

  return {
    dragActive,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileInput,
  };
}

function isResumeReference(value: unknown): value is ResumeChatReference {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ResumeChatReference>;
  return (
    typeof candidate.artifactId === "string" &&
    typeof candidate.targetId === "string" &&
    typeof candidate.label === "string"
  );
}
