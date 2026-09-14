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
