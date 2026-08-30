import type { WriteAccessCheck } from "../../../browser/types.js";
import type { BrowserWriteAccessGate } from "./browser-write-access-gate.js";

export class BrowserPageAccessState {
  readonly #listeners = new Set<() => void>();

  public constructor(
    private readonly gate: BrowserWriteAccessGate,
    private readonly clearWrites: () => void,
    private readonly onRevoked: () => void,
  ) {}

  public subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public isGranted(): boolean {
    const wasGranted = this.gate.snapshot().granted;
    const granted = this.gate.isGranted();
    this.#afterGateCheck(wasGranted);
    return granted;
  }

  public check(tabId: string | null, origin: string | null): WriteAccessCheck {
    const wasGranted = this.gate.snapshot().granted;
    const result = this.gate.check(tabId, origin);
    this.#afterGateCheck(wasGranted);
    return result;
  }

  public changed(): void { this.#notify(); }

  public contextChanged(): void {
    if (!this.gate.snapshot().granted) this.clearWrites();
    this.#notify();
  }

  #afterGateCheck(wasGranted: boolean): void {
    if (!wasGranted || this.gate.snapshot().granted) return;
    this.clearWrites();
    this.onRevoked();
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      try { listener(); } catch { /* Projection listeners cannot fail page actions. */ }
    }
  }
}
