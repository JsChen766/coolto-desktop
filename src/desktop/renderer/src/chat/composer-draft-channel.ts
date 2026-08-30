type ComposerDraftListener = (text: string) => void;

const listeners = new Set<ComposerDraftListener>();

export function publishComposerDraft(text: string): void {
  listeners.forEach((listener) => listener(text));
}

export function subscribeComposerDraft(
  listener: ComposerDraftListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
