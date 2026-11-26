import type { WindowDraftSaveState } from "../shared/types.js";

export type WindowCloseAction = "allow" | "hide" | "prompt-hide" | "prompt-quit";

export function resolveWindowCloseAction(input: {
  forceClose: boolean;
  quitting: boolean;
  draftState: WindowDraftSaveState;
}): WindowCloseAction {
  if (input.forceClose) return "allow";
  const dirty = input.draftState !== "saved" && input.draftState !== "idle";
  if (!input.quitting) return dirty ? "prompt-hide" : "hide";
  return dirty ? "prompt-quit" : "allow";
}

export type WindowClosePromptMode = "hide" | "quit";
export type WindowClosePromptOutcome = "save" | "discard" | "cancel" | "save-failed";
export type WindowCloseCompletion = "hide" | "quit-app";

// Preventing the close to show a quit prompt makes Electron cancel the
// in-progress app.quit(); a prompt that ends without quitting must therefore
// reset the quit state, or later closes stop hiding to the tray.
export function closePromptAbortsQuit(
  mode: WindowClosePromptMode,
  outcome: WindowClosePromptOutcome,
): boolean {
  return mode === "quit" && (outcome === "cancel" || outcome === "save-failed");
}

// A quit prompt that ends in "...并退出" must re-issue app.quit(): the original
// quit was already cancelled, and macOS does not quit on window-all-closed.
export function resolveCloseCompletion(
  mode: WindowClosePromptMode | undefined,
): WindowCloseCompletion {
  return mode === "hide" ? "hide" : "quit-app";
}
