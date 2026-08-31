export type BrowserTabMoveDirection =
  | "previous"
  | "next"
  | "first"
  | "last";

export const BROWSER_TAB_OVERFLOW_CONTROLS_WIDTH = 52;

export function shouldShowBrowserTabOverflow(
  scrollWidth: number,
  clientWidth: number,
  controlsShown: boolean,
): boolean {
  const availableWithoutControls = clientWidth +
    (controlsShown ? BROWSER_TAB_OVERFLOW_CONTROLS_WIDTH : 0);
  return scrollWidth > availableWithoutControls + 1;
}

export function moveBrowserTabFocus(
  tabIds: readonly string[],
  currentId: string | null,
  direction: BrowserTabMoveDirection,
): string | null {
  if (tabIds.length === 0) return null;
  if (direction === "first") return tabIds[0] ?? null;
  if (direction === "last") return tabIds.at(-1) ?? null;

  const currentIndex = currentId ? tabIds.indexOf(currentId) : -1;
  if (currentIndex === -1) {
    return direction === "previous"
      ? tabIds.at(-1) ?? null
      : tabIds[0] ?? null;
  }
  const offset = direction === "previous" ? -1 : 1;
  const nextIndex = (currentIndex + offset + tabIds.length) % tabIds.length;
  return tabIds[nextIndex] ?? null;
}

export function browserTabFocusAfterClose(
  tabIds: readonly string[],
  closingId: string,
): string | null {
  const closingIndex = tabIds.indexOf(closingId);
  if (closingIndex === -1) return tabIds[0] ?? null;
  return tabIds[closingIndex + 1] ?? tabIds[closingIndex - 1] ?? null;
}

export function resolveBrowserTabRovingId(
  tabIds: readonly string[],
  preferredId: string | null,
  activeId: string | null,
): string | null {
  if (preferredId && tabIds.includes(preferredId)) return preferredId;
  if (activeId && tabIds.includes(activeId)) return activeId;
  return tabIds[0] ?? null;
}
