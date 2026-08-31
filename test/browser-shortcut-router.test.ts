import assert from "node:assert/strict";
import test from "node:test";

import type { Event as ElectronEvent, Input } from "electron";

import type { BrowserShortcutInput } from "../src/browser/browser-shortcut-policy.js";
import {
  BrowserShortcutRouter,
  type BrowserShortcutContents,
  type BrowserShortcutHandlers,
} from "../src/desktop/main/browser/browser-shortcut-router.js";

test("shortcut router consumes classified accelerators before dispatch", () => {
  const contents = new FakeShortcutContents();
  const calls: string[] = [];
  let findOpen = false;
  let downloadOpen = false;
  let inspectorOpen = false;
  let isLoading = false;
  let handled = true;
  const record = (value: string): boolean => {
    calls.push(value);
    return handled;
  };
  const handlers: BrowserShortcutHandlers = {
    getContext: () => ({ downloadOpen, findOpen, inspectorOpen, isLoading }),
    focusAddress: () => record("focus-address"),
    newTab: () => record("new-tab"),
    closeTab: () => record("close-tab"),
    cycleTab: (direction) => record(`cycle:${direction}`),
    selectTab: (index) => record(`select:${index}`),
    selectLastTab: () => record("select-last"),
    reload: () => record("reload"),
    stopLoading: () => record("stop-loading"),
    goBack: () => record("go-back"),
    goForward: () => record("go-forward"),
    openFind: () => record("open-find"),
    closeFind: () => record("close-find"),
    closeDownloads: () => record("close-downloads"),
    closeInspector: () => record("close-inspector"),
    findNext: (direction) => record(`find:${direction}`),
    zoom: (action) => record(`zoom:${action}`),
  };
  const dispose = new BrowserShortcutRouter(handlers, "win32").attach(contents);

  const cases: Array<[BrowserShortcutInput, string]> = [
    [key("KeyL", { control: true }), "focus-address"],
    [key("KeyT", { control: true }), "new-tab"],
    [key("KeyW", { control: true }), "close-tab"],
    [key("Tab", { control: true }), "cycle:next"],
    [key("Tab", { control: true, shift: true }), "cycle:previous"],
    [key("Digit4", { control: true }, "4"), "select:3"],
    [key("Digit9", { control: true }, "9"), "select-last"],
    [key("KeyR", { control: true }), "reload"],
    [key("ArrowLeft", { alt: true }), "go-back"],
    [key("ArrowRight", { alt: true }), "go-forward"],
    [key("KeyF", { control: true }), "open-find"],
    [key("F3", { shift: true }), "find:previous"],
    [key("Equal", { control: true }, "+"), "zoom:in"],
    [key("Minus", { control: true }, "-"), "zoom:out"],
    [key("Digit0", { control: true }, "0"), "zoom:reset"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(contents.emit(input), true);
    assert.equal(calls.at(-1), expected);
  }

  findOpen = true;
  assert.equal(contents.emit(key("Escape")), true);
  assert.equal(calls.at(-1), "close-find");
  findOpen = false;
  downloadOpen = true;
  assert.equal(contents.emit(key("Escape")), true);
  assert.equal(calls.at(-1), "close-downloads");
  downloadOpen = false;
  inspectorOpen = true;
  assert.equal(contents.emit(key("Escape")), true);
  assert.equal(calls.at(-1), "close-inspector");
  inspectorOpen = false;
  isLoading = true;
  assert.equal(contents.emit(key("Escape")), true);
  assert.equal(calls.at(-1), "stop-loading");

  const beforeUnsupported = calls.length;
  assert.equal(contents.emit(key("KeyC", { control: true })), false);
  assert.equal(calls.length, beforeUnsupported);
  handled = false;
  assert.equal(contents.emit(key("KeyL", { control: true })), true);

  const beforeDispose = calls.length;
  dispose();
  dispose();
  assert.equal(contents.emit(key("KeyT", { control: true })), false);
  assert.equal(calls.length, beforeDispose);
});

class FakeShortcutContents implements BrowserShortcutContents {
  private listener: ((event: ElectronEvent, input: Input) => void) | undefined;

  public on(_event: "before-input-event", listener: typeof this.listener): void {
    this.listener = listener;
  }

  public off(_event: "before-input-event", listener: typeof this.listener): void {
    if (this.listener === listener) this.listener = undefined;
  }

  public emit(input: BrowserShortcutInput): boolean {
    let prevented = false;
    const event = { preventDefault: () => { prevented = true; } } as ElectronEvent;
    this.listener?.(event, input as Input);
    return prevented;
  }
}

function key(
  code: string,
  changes: Partial<BrowserShortcutInput> = {},
  value = code,
): BrowserShortcutInput {
  return {
    type: "keyDown", key: value, code,
    isAutoRepeat: false, isComposing: false,
    shift: false, control: false, alt: false, meta: false,
    ...changes,
  };
}
