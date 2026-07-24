import type { ResumeChatReference } from "@desktop/types";

type ResumeReferenceListener = (reference: ResumeChatReference) => void;

const listeners = new Set<ResumeReferenceListener>();

export function publishResumeReference(reference: ResumeChatReference): void {
  const safeReference = structuredClone(reference);
  listeners.forEach((listener) => listener(safeReference));
}

export function subscribeResumeReference(
  listener: ResumeReferenceListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
