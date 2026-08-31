import type { BrowserPageHandoffNavigationRequest } from
  "../../../../browser/browser-agent-task-navigation.js";

type Listener = (request: BrowserPageHandoffNavigationRequest) => void;
const listeners = new Set<Listener>();
let current: BrowserPageHandoffNavigationRequest | undefined;

export function publishBrowserPageHandoff(
  request: BrowserPageHandoffNavigationRequest,
): void {
  current = request;
  for (const listener of listeners) listener(request);
}

export function subscribeBrowserPageHandoff(listener: Listener): () => void {
  listeners.add(listener);
  if (current) listener(current);
  return () => listeners.delete(listener);
}
