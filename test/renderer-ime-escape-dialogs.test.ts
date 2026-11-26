import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isImeComposing } from "../src/desktop/renderer/src/lib/ime-keyboard.js";

async function source(name: string): Promise<string> {
  const text = await readFile(new URL(`../src/desktop/renderer/src/${name}`, import.meta.url), "utf8");
  // Windows checkouts may use CRLF (core.autocrlf); macOS/Linux use LF.
  return text.replace(/\r\n/gu, "\n");
}

function keydownBody(text: string): string {
  const start = text.indexOf("function keydown(event: KeyboardEvent): void {");
  assert.ok(start >= 0, "missing keydown handler");
  const end = text.indexOf("\n}\n", start);
  assert.ok(end > start, "unterminated keydown handler");
  return text.slice(start, end);
}

test("isImeComposing treats an IME-cancelling Escape as composition", () => {
  // macOS Chromium: Escape that cancels marked text keeps key "Escape".
  assert.equal(isImeComposing({ isComposing: true, keyCode: 27 }), true);
  // Windows Chromium / WebKit: the IME-owned keydown carries keyCode 229.
  assert.equal(isImeComposing({ isComposing: false, keyCode: 229 }), true);
  // A plain Escape outside composition still closes the dialog.
  assert.equal(isImeComposing({ isComposing: false, keyCode: 27 }), false);
});

test("Profile, Preference and Settings dialogs ignore Escape during IME composition", async () => {
  for (const name of [
    "components/ProfileDialog.vue",
    "components/PreferenceDialog.vue",
    "components/SettingsDialog.vue",
  ]) {
    const text = await source(name);
    assert.match(text, /import \{ isImeComposing \} from "\.\.\/lib\/ime-keyboard";/u, name);
    const body = keydownBody(text);
    const guard = body.indexOf("if (isImeComposing(event)) return;");
    const escape = body.indexOf('event.key === "Escape"');
    assert.ok(guard >= 0, `${name} keydown must guard IME composition`);
    assert.ok(escape > guard, `${name} must check composition before Escape`);
    assert.ok(body.indexOf('event.key !== "Tab"') > guard, `${name} focus trap runs after guard`);
  }
});
