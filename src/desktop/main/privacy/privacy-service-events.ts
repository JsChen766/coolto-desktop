import type { PrivacyGateState } from "../../shared/types/privacy.js";

export function emitPrivacyState(
  listeners: Set<(state: PrivacyGateState) => void>,
  state: PrivacyGateState,
): void {
  for (const listener of listeners) listener(state);
}
