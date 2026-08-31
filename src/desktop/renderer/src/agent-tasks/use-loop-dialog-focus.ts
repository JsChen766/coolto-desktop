import { nextTick, onBeforeUnmount, onMounted, useTemplateRef } from "vue";

export function useLoopDialogFocus(dismiss: () => void) {
  const dialog = useTemplateRef<HTMLElement>("dialog");
  let previousFocus: HTMLElement | null = null;
  onMounted(async () => {
    previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    await nextTick();
    dialog.value?.querySelector<HTMLElement>("[data-loop-initial-focus]")?.focus();
  });
  onBeforeUnmount(() => {
    if (previousFocus?.isConnected) previousFocus.focus();
  });
  function keydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      dismiss();
      return;
    }
    if (event.key !== "Tab" || !dialog.value) return;
    const focusable = [...dialog.value.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
    )].filter((element) => !element.hidden);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
  return { dialog, keydown };
}
