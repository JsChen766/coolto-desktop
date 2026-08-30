import { canonicalHash } from "./canonical-hash.js";
import type { JsonValue } from "./json-types.js";

interface ObservationEntry {
  evidenceRef: string | null;
  hash: string;
  observedAt: number;
  runId: string;
  url: string | null;
}

const MAX_OBSERVATIONS = 64;

export class ManagedTaskObservationCache {
  readonly #entries = new Map<string, ObservationEntry>();

  public record(
    runId: string,
    details: unknown,
    evidenceRef: string | null,
  ): void {
    if (!details || typeof details !== "object") return;
    const tab = (details as { tab?: { id?: unknown; url?: unknown } }).tab;
    if (typeof tab?.id !== "string") return;
    this.#entries.delete(tab.id);
    this.#entries.set(tab.id, {
      evidenceRef,
      hash: canonicalHash(toJson(details)),
      observedAt: Date.now(),
      runId,
      url: typeof tab.url === "string" ? tab.url : null,
    });
    while (this.#entries.size > MAX_OBSERVATIONS) {
      const oldest = this.#entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.#entries.delete(oldest);
    }
  }

  public hash(
    runId: string,
    tabId: string | null,
    url: string | null,
  ): string | null {
    return this.#fresh(runId, tabId, url)?.hash ?? null;
  }

  public evidenceRef(
    runId: string,
    tabId: string | null,
    url: string | null,
  ): string | null {
    return this.#fresh(runId, tabId, url)?.evidenceRef ?? null;
  }

  #fresh(
    runId: string,
    tabId: string | null,
    url: string | null,
  ): ObservationEntry | null {
    if (!tabId) return null;
    const value = this.#entries.get(tabId);
    const fresh = value && value.runId === runId && value.url === url &&
      Date.now() - value.observedAt <= 30_000;
    if (!fresh) this.#entries.delete(tabId);
    return fresh ? value : null;
  }
}

function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}
