import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isImeComposing } from "../src/desktop/renderer/src/lib/ime-keyboard.js";

async function component(name: string): Promise<string> {
  const text = await readFile(
    new URL(`../src/desktop/renderer/src/components/${name}`, import.meta.url),
    "utf8",
  );
  // Windows checkouts may use CRLF (core.autocrlf); macOS/Linux use LF.
  return text.replace(/\r\n/gu, "\n");
}

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const end = source.indexOf("\n}\n", start);
  assert.ok(end > start, `unterminated function ${name}`);
  return source.slice(start, end);
}

test("isImeComposing flags composition keydowns on macOS and Windows", () => {
  // macOS Chromium: Enter that commits a composition keeps key "Enter".
  assert.equal(isImeComposing({ isComposing: true, keyCode: 229 }), true);
  // WebKit/Safari order: keydown arrives after compositionend with keyCode 229.
  assert.equal(isImeComposing({ isComposing: false, keyCode: 229 }), true);
  // Windows Chromium: key is "Process" but the event is still composing.
  assert.equal(isImeComposing({ isComposing: true, keyCode: 13 }), true);
  // A plain Enter outside composition must still submit.
  assert.equal(isImeComposing({ isComposing: false, keyCode: 13 }), false);
});

test("Enter-to-submit inputs ignore IME composition", async () => {
  for (const name of [
    "ApprovalCard.vue",
    "ConversationDialog.vue",
    "A4ResumeEditor.vue",
    "ExperienceTagEditor.vue",
  ]) {
    const source = await component(name);
    assert.match(source, /import \{ isImeComposing \} from "\.\.\/lib\/ime-keyboard";/u, name);
    assert.match(source, /isImeComposing\(event\)/u, name);
  }
});

test("ApprovalCard custom answer does not submit mid-composition or while busy", async () => {
  const source = await component("ApprovalCard.vue");
  assert.doesNotMatch(source, /@keydown\.enter\.exact\.prevent="submitCustom"/u);
  assert.match(source, /@keydown\.enter\.exact="onCustomEnter"/u);
  const onEnter = functionBody(source, "onCustomEnter");
  const guard = onEnter.indexOf("if (isImeComposing(event)) return;");
  assert.ok(guard >= 0, "onCustomEnter must guard IME composition");
  assert.ok(guard < onEnter.indexOf("event.preventDefault()"));
  assert.ok(guard < onEnter.indexOf("submitCustom()"));
  const submit = functionBody(source, "submitCustom");
  const busy = submit.indexOf("if (props.busy) return;");
  assert.ok(busy >= 0, "submitCustom must refuse while busy");
  assert.ok(busy < submit.indexOf('emit("decide"'));
});

test("ConversationDialog rename Enter skips composition and blank titles", async () => {
  const source = await component("ConversationDialog.vue");
  assert.doesNotMatch(source, /@keydown\.enter\.prevent="\$emit\('confirm', value\)"/u);
  assert.match(source, /@keydown\.enter="onEnter"/u);
  const onEnter = functionBody(source, "onEnter");
  const guard = onEnter.indexOf("if (isImeComposing(event)) return;");
  assert.ok(guard >= 0, "onEnter must guard IME composition");
  assert.ok(guard < onEnter.indexOf("event.preventDefault()"));
  assert.match(onEnter, /if \(value\.value\.trim\(\)\) emit\("confirm", value\.value\);/u);
});

test("A4 resume editor does not blur on a composition-committing Enter", async () => {
  const source = await component("A4ResumeEditor.vue");
  assert.match(
    source,
    /event\.key === "Enter" && !event\.shiftKey && !isImeComposing\(event\)/u,
  );
});

test("Experience tag editor does not commit tags mid-composition", async () => {
  const source = await component("ExperienceTagEditor.vue");
  const body = functionBody(source, "onKeydown");
  const guard = body.indexOf("if (isImeComposing(event)) return;");
  assert.ok(guard >= 0, "onKeydown must guard IME composition");
  assert.ok(guard < body.indexOf("event.preventDefault()"));
  assert.ok(guard < body.indexOf("commit()"));
});
