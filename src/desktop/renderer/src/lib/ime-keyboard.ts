/**
 * The slice of `KeyboardEvent` needed to detect IME composition. Kept
 * structural (no DOM lib types) so Node tests can import this helper.
 */
export interface ImeKeyboardEventLike {
  readonly isComposing: boolean;
  readonly keyCode: number;
}

/**
 * True while a keydown belongs to an IME composition and must not trigger
 * shortcuts such as Enter-to-submit or Escape-to-close.
 *
 * Chromium on macOS dispatches the Enter/Escape that commits or cancels a
 * composition with `key === "Enter"`/`"Escape"` and `isComposing === true`
 * (Windows reports `key === "Process"` instead). `keyCode === 229` also covers
 * engines that deliver that keydown after `compositionend`.
 */
export function isImeComposing(event: ImeKeyboardEventLike): boolean {
  return event.isComposing || event.keyCode === 229;
}
