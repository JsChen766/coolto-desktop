import type { BrowserFindState } from "../../shared/types.js";

export const MAX_BROWSER_FIND_QUERY_LENGTH = 1_000;

export interface BrowserFindResult {
  requestId: number;
  activeMatchOrdinal: number;
  matches: number;
}

export interface BrowserFindContents {
  findInPage(text: string, options: {
    forward: boolean;
    findNext: boolean;
  }): number;
  stopFindInPage(action: "clearSelection" | "keepSelection"): void;
  on(
    event: "found-in-page",
    listener: (event: unknown, result: BrowserFindResult) => void,
  ): unknown;
  off(
    event: "found-in-page",
    listener: (event: unknown, result: BrowserFindResult) => void,
  ): unknown;
  isDestroyed?(): boolean;
}

const EMPTY_FIND_STATE: BrowserFindState = {
  open: false,
  query: "",
  matches: 0,
  activeMatchOrdinal: 0,
};

export class BrowserTabFindController {
  #currentRequestId: number | null = null;
  #disposed = false;
  #state: BrowserFindState = { ...EMPTY_FIND_STATE };

  readonly #onFound = (_event: unknown, result: BrowserFindResult): void => {
    if (this.#disposed || result.requestId !== this.#currentRequestId) return;
    const matches = nonNegativeInteger(result.matches);
    const activeMatchOrdinal = Math.min(
      matches,
      nonNegativeInteger(result.activeMatchOrdinal),
    );
    this.#update({ matches, activeMatchOrdinal });
  };

  public constructor(
    private readonly contents: BrowserFindContents,
    private readonly onChange: () => void,
  ) {
    contents.on("found-in-page", this.#onFound);
  }

  public getState(): BrowserFindState {
    return { ...this.#state };
  }

  public open(): void {
    if (!this.#available()) return;
    const changed = !this.#state.open;
    this.#state.open = true;
    if (this.#state.query) {
      this.#request(this.#state.query, true, true);
      return;
    }
    if (changed) this.onChange();
  }

  public search(query: string): void {
    if (!this.#available()) return;
    const bounded = query.slice(0, MAX_BROWSER_FIND_QUERY_LENGTH);
    this.#state = {
      open: true,
      query: bounded,
      matches: 0,
      activeMatchOrdinal: 0,
    };
    if (!bounded) {
      this.#currentRequestId = null;
      this.contents.stopFindInPage("clearSelection");
      this.onChange();
      return;
    }
    this.#request(bounded, true, true);
  }

  public next(direction: "next" | "previous"): void {
    if (!this.#available() || !this.#state.open || !this.#state.query) return;
    this.#request(this.#state.query, direction === "next", false);
  }

  public close(): void {
    if (!this.#available() || !this.#state.open) return;
    this.#currentRequestId = null;
    this.contents.stopFindInPage("keepSelection");
    this.#state.open = false;
    this.onChange();
  }

  public resetOnNavigation(): void {
    if (!this.#available()) return;
    const hadFind = this.#state.open || Boolean(this.#state.query) ||
      this.#currentRequestId !== null;
    this.#currentRequestId = null;
    this.#state = { ...EMPTY_FIND_STATE };
    if (hadFind) {
      this.contents.stopFindInPage("clearSelection");
      this.onChange();
    }
  }

  public dispose(): void {
    if (this.#disposed) return;
    if (!this.contents.isDestroyed?.()) {
      this.contents.stopFindInPage("clearSelection");
      this.contents.off("found-in-page", this.#onFound);
    }
    this.#currentRequestId = null;
    this.#disposed = true;
  }

  #request(query: string, forward: boolean, findNext: boolean): void {
    this.#currentRequestId = this.contents.findInPage(query, { forward, findNext });
    this.onChange();
  }

  #update(changes: Pick<BrowserFindState, "matches" | "activeMatchOrdinal">): void {
    if (
      changes.matches === this.#state.matches &&
      changes.activeMatchOrdinal === this.#state.activeMatchOrdinal
    ) return;
    Object.assign(this.#state, changes);
    this.onChange();
  }

  #available(): boolean {
    return !this.#disposed && !this.contents.isDestroyed?.();
  }
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
