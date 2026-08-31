import assert from "node:assert/strict";
import test from "node:test";

import {
  BrowserTabFindController,
  MAX_BROWSER_FIND_QUERY_LENGTH,
  type BrowserFindContents,
  type BrowserFindResult,
} from "../src/desktop/main/browser/browser-tab-find.js";

test("find controller opens, bounds queries and accepts the current result", () => {
  const contents = new FakeFindContents();
  let changes = 0;
  const find = new BrowserTabFindController(contents, () => changes++);

  find.open();
  assert.deepEqual(find.getState(), {
    open: true, query: "", matches: 0, activeMatchOrdinal: 0,
  });
  find.search("x".repeat(MAX_BROWSER_FIND_QUERY_LENGTH + 20));
  assert.equal(find.getState().query.length, MAX_BROWSER_FIND_QUERY_LENGTH);
  assert.deepEqual(contents.requests[0]?.options, { forward: true, findNext: true });

  contents.emit({ requestId: 1, matches: 4, activeMatchOrdinal: 2 });
  assert.deepEqual(find.getState(), {
    open: true,
    query: "x".repeat(MAX_BROWSER_FIND_QUERY_LENGTH),
    matches: 4,
    activeMatchOrdinal: 2,
  });
  assert.equal(changes, 3);
});

test("find controller rejects stale request results and navigates matches", () => {
  const contents = new FakeFindContents();
  const find = new BrowserTabFindController(contents, () => {});
  find.search("first");
  find.search("second");

  contents.emit({ requestId: 1, matches: 9, activeMatchOrdinal: 7 });
  assert.equal(find.getState().matches, 0);
  contents.emit({ requestId: 2, matches: 3, activeMatchOrdinal: 1 });
  assert.equal(find.getState().matches, 3);

  find.next("next");
  find.next("previous");
  assert.deepEqual(contents.requests.slice(-2).map((request) => request.options), [
    { forward: true, findNext: false },
    { forward: false, findNext: false },
  ]);
  contents.emit({ requestId: 2, matches: 10, activeMatchOrdinal: 10 });
  assert.equal(find.getState().matches, 3);
  contents.emit({ requestId: 4, matches: 2, activeMatchOrdinal: 8 });
  assert.deepEqual(find.getState(), {
    open: true, query: "second", matches: 2, activeMatchOrdinal: 2,
  });
});

test("close preserves the query, reopen restarts, and navigation clears state", () => {
  const contents = new FakeFindContents();
  const find = new BrowserTabFindController(contents, () => {});
  find.search("role");
  contents.emit({ requestId: 1, matches: 2, activeMatchOrdinal: 1 });

  find.close();
  assert.deepEqual(contents.stops, ["keepSelection"]);
  assert.deepEqual(find.getState(), {
    open: false, query: "role", matches: 2, activeMatchOrdinal: 1,
  });
  contents.emit({ requestId: 1, matches: 8, activeMatchOrdinal: 8 });
  assert.equal(find.getState().matches, 2);

  find.open();
  assert.deepEqual(contents.requests.at(-1)?.options, { forward: true, findNext: true });
  find.resetOnNavigation();
  assert.deepEqual(find.getState(), {
    open: false, query: "", matches: 0, activeMatchOrdinal: 0,
  });
  assert.deepEqual(contents.stops, ["keepSelection", "clearSelection"]);
});

test("empty search clears selection and dispose is idempotent", () => {
  const contents = new FakeFindContents();
  const find = new BrowserTabFindController(contents, () => {});
  find.search("engineer");
  find.search("");
  assert.deepEqual(find.getState(), {
    open: true, query: "", matches: 0, activeMatchOrdinal: 0,
  });
  assert.deepEqual(contents.stops, ["clearSelection"]);

  find.dispose();
  find.dispose();
  find.search("ignored");
  contents.emit({ requestId: 1, matches: 5, activeMatchOrdinal: 1 });
  assert.equal(contents.listenerCount, 0);
  assert.deepEqual(contents.stops, ["clearSelection", "clearSelection"]);
  assert.equal(contents.requests.length, 1);
});

class FakeFindContents implements BrowserFindContents {
  readonly requests: Array<{
    id: number;
    text: string;
    options: { forward: boolean; findNext: boolean };
  }> = [];
  readonly stops: Array<"clearSelection" | "keepSelection"> = [];
  readonly #listeners = new Set<(
    event: unknown,
    result: BrowserFindResult,
  ) => void>();

  public get listenerCount(): number { return this.#listeners.size; }

  public findInPage(
    text: string,
    options: { forward: boolean; findNext: boolean },
  ): number {
    const id = this.requests.length + 1;
    this.requests.push({ id, text, options });
    return id;
  }

  public stopFindInPage(action: "clearSelection" | "keepSelection"): void {
    this.stops.push(action);
  }

  public on(
    _event: "found-in-page",
    listener: (event: unknown, result: BrowserFindResult) => void,
  ): void {
    this.#listeners.add(listener);
  }

  public off(
    _event: "found-in-page",
    listener: (event: unknown, result: BrowserFindResult) => void,
  ): void {
    this.#listeners.delete(listener);
  }

  public emit(result: BrowserFindResult): void {
    for (const listener of this.#listeners) listener({}, result);
  }
}
