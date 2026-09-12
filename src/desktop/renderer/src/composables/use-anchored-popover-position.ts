import { type CSSProperties, type Ref, onBeforeUnmount, ref, watch } from "vue";

const MENU_GAP = 6;
const VIEWPORT_PAD = 8;

export function useAnchoredPopoverPosition(
  anchor: Ref<HTMLElement | undefined>,
  open: Ref<boolean>,
): { menuStyle: Ref<CSSProperties>; syncPosition: () => void } {
  const menuStyle = ref<CSSProperties>({ visibility: "hidden" });

  function syncPosition(): void {
    const element = anchor.value;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_PAD;
    const spaceAbove = rect.top - VIEWPORT_PAD;
    const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(120, Math.min(280, preferBelow ? spaceBelow - MENU_GAP : spaceAbove - MENU_GAP));
    const top = preferBelow
      ? rect.bottom + MENU_GAP
      : Math.max(VIEWPORT_PAD, rect.top - MENU_GAP - maxHeight);
    menuStyle.value = {
      position: "fixed",
      top: `${top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      maxHeight: `${maxHeight}px`,
      zIndex: 130,
      visibility: "visible",
    };
  }

  function bind(): void {
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
  }

  function unbind(): void {
    window.removeEventListener("resize", syncPosition);
    window.removeEventListener("scroll", syncPosition, true);
  }

  watch(open, async (isOpen) => {
    if (isOpen) {
      await Promise.resolve();
      syncPosition();
      bind();
    } else {
      unbind();
      menuStyle.value = { visibility: "hidden" };
    }
  });

  onBeforeUnmount(unbind);

  return { menuStyle, syncPosition };
}
