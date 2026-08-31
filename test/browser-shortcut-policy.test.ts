import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveBrowserShortcut,
  type BrowserShortcutContext,
  type BrowserShortcutInput,
} from "../src/browser/browser-shortcut-policy.js";

const IDLE: BrowserShortcutContext = {
  downloadOpen: false, findOpen: false, inspectorOpen: false, isLoading: false,
};

test("Windows browser shortcuts classify navigation, tabs, find and zoom", () => {
  assert.deepEqual(resolve("win32", key("KeyL", { control: true })),
    { kind: "focus-address" });
  assert.deepEqual(resolve("win32", key("KeyT", { control: true })),
    { kind: "new-tab" });
  assert.deepEqual(resolve("win32", key("KeyW", { control: true })),
    { kind: "close-tab" });
  assert.deepEqual(resolve("win32", key("Tab", { control: true, shift: true })),
    { kind: "cycle-tab", direction: "previous" });
  assert.deepEqual(resolve("win32", key("PageDown", { control: true })),
    { kind: "cycle-tab", direction: "next" });
  assert.deepEqual(resolve("win32", key("Digit4", { control: true }, "4")),
    { kind: "select-tab", index: 3 });
  assert.deepEqual(resolve("win32", key("Digit9", { control: true }, "9")),
    { kind: "select-last-tab" });
  assert.deepEqual(resolve("win32", key("ArrowLeft", { alt: true })),
    { kind: "go-back" });
  assert.deepEqual(resolve("win32", key("F5")), { kind: "reload" });
  assert.deepEqual(resolve("win32", key("F3", { shift: true })),
    { kind: "find-next", direction: "previous" });
  assert.deepEqual(resolve("win32", key("Equal", { control: true, shift: true }, "+")),
    { kind: "zoom", action: "in" });
  assert.deepEqual(resolve("win32", key("Minus", { control: true }, "-")),
    { kind: "zoom", action: "out" });
});

test("macOS browser shortcuts use Command while tab cycling stays on Control", () => {
  assert.deepEqual(resolve("darwin", key("KeyL", { meta: true })),
    { kind: "focus-address" });
  assert.deepEqual(resolve("darwin", key("Digit2", { meta: true }, "2")),
    { kind: "select-tab", index: 1 });
  assert.deepEqual(resolve("darwin", key("Tab", { control: true })),
    { kind: "cycle-tab", direction: "next" });
  assert.deepEqual(resolve("darwin", key("BracketLeft", { meta: true }, "[")),
    { kind: "go-back" });
  assert.deepEqual(resolve("darwin", key("BracketRight", { meta: true }, "]")),
    { kind: "go-forward" });
  assert.deepEqual(resolve("darwin", key("KeyG", { meta: true, shift: true })),
    { kind: "find-next", direction: "previous" });
  assert.equal(resolve("darwin", key("F5")), null);
  assert.equal(resolve("darwin", key("KeyL", { control: true })), null);
});

test("Escape follows find, downloads, inspector, then loading precedence", () => {
  assert.deepEqual(resolve("win32", key("Escape"), {
    downloadOpen: true, findOpen: true, inspectorOpen: true, isLoading: true,
  }), { kind: "close-find" });
  assert.deepEqual(resolve("win32", key("Escape"), {
    downloadOpen: true, findOpen: false, inspectorOpen: true, isLoading: true,
  }), { kind: "close-downloads" });
  assert.deepEqual(resolve("win32", key("Escape"), {
    downloadOpen: false, findOpen: false, inspectorOpen: true, isLoading: true,
  }), { kind: "close-inspector" });
  assert.deepEqual(resolve("win32", key("Escape"), {
    downloadOpen: false, findOpen: false, inspectorOpen: false, isLoading: true,
  }), { kind: "stop-loading" });
  assert.equal(resolve("win32", key("Escape")), null);
});

test("IME, keyUp, repeats and unsupported modifier chords are not intercepted", () => {
  assert.equal(resolve("win32", key("KeyL", { control: true, isComposing: true })), null);
  assert.equal(resolve("win32", key("KeyL", { control: true, type: "keyUp" })), null);
  assert.equal(resolve("win32", key("KeyW", { control: true, isAutoRepeat: true })), null);
  assert.equal(resolve("win32", key("KeyL", { control: true, alt: true })), null);
  assert.equal(resolve("darwin", key("KeyL", { meta: true, control: true })), null);
  assert.equal(resolve("win32", key("KeyT", { control: true, shift: true })), null);
  assert.equal(resolve("win32", key("PageDown", { control: true, shift: true })), null);
  for (const code of ["KeyA", "KeyC", "KeyV", "KeyZ"]) {
    assert.equal(resolve("win32", key(code, { control: true })), null);
  }
});

function resolve(
  platform: string,
  input: BrowserShortcutInput,
  context: BrowserShortcutContext = IDLE,
) {
  return resolveBrowserShortcut(input, platform, context);
}

function key(
  code: string,
  changes: Partial<BrowserShortcutInput> = {},
  value = code,
): BrowserShortcutInput {
  return {
    type: "keyDown",
    key: value,
    code,
    isAutoRepeat: false,
    isComposing: false,
    shift: false,
    control: false,
    alt: false,
    meta: false,
    ...changes,
  };
}
