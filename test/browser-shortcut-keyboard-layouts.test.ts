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

const PLATFORMS = ["win32", "darwin"] as const;

test("AZERTY undo is not mistaken for close-tab on Windows or macOS", () => {
  assert.equal(resolve("win32", press("KeyW", "z", { control: true })), null);
  assert.equal(resolve("darwin", press("KeyW", "z", { meta: true })), null);
  for (const platform of PLATFORMS) {
    assert.deepEqual(resolve(platform, primary(platform, "KeyZ", "w")),
      { kind: "close-tab" }, platform);
    assert.equal(resolve(platform, primary(platform, "KeyQ", "a")), null, platform);
  }
});

test("Dvorak letters and punctuation follow the produced character", () => {
  for (const platform of PLATFORMS) {
    assert.equal(resolve(platform, primary(platform, "KeyR", "p")), null, platform);
    assert.equal(resolve(platform, primary(platform, "KeyT", "y")), null, platform);
    assert.deepEqual(resolve(platform, primary(platform, "KeyO", "r")),
      { kind: "reload" }, platform);
    assert.equal(resolve(platform, primary(platform, "KeyW", ",")), null, platform);
  }
  assert.equal(resolve("darwin", press("BracketLeft", "/", { meta: true })), null);
  assert.deepEqual(resolve("darwin", press("Minus", "[", { meta: true })),
    { kind: "go-back" });
});

test("non-Latin layouts fall back to the physical key like Chrome", () => {
  for (const platform of PLATFORMS) {
    assert.deepEqual(resolve(platform, primary(platform, "KeyW", "ц")),
      { kind: "close-tab" }, platform);
    assert.deepEqual(resolve(platform, primary(platform, "KeyT", "е")),
      { kind: "new-tab" }, platform);
  }
});

test("IME process keys, Caps Lock and non-ASCII punctuation stay robust", () => {
  for (const platform of PLATFORMS) {
    assert.deepEqual(resolve(platform, primary(platform, "KeyW", "Process")),
      { kind: "close-tab" }, platform);
    assert.deepEqual(resolve(platform, primary(platform, "KeyW", "W")),
      { kind: "close-tab" }, platform);
    assert.deepEqual(resolve(platform, primary(platform, "KeyL", "Dead")),
      { kind: "focus-address" }, platform);
  }
  assert.deepEqual(resolve("darwin", press("BracketLeft", "ü", { meta: true })),
    { kind: "go-back" });
});

function resolve(platform: string, input: BrowserShortcutInput) {
  return resolveBrowserShortcut(input, platform, IDLE);
}

function primary(platform: string, code: string, value: string): BrowserShortcutInput {
  return press(code, value, platform === "darwin" ? { meta: true } : { control: true });
}

function press(
  code: string,
  value: string,
  changes: Partial<BrowserShortcutInput> = {},
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
