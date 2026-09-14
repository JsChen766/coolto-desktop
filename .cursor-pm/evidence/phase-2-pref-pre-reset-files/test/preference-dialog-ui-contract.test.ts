import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(name: string): Promise<string> {
  return readFile(new URL(`../src/desktop/renderer/src/${name}`, import.meta.url), "utf8");
}

test("Preference dialog hands focus across list, edit, proposal, and list phases", async () => {
  const dialog = await source("components/PreferenceDialog.vue");
  assert.match(dialog, /const phase = computed<PreferenceDialogPhase>/u);
  assert.match(dialog, /watch\(\[phase, state\.items, state\.busy\]/u);
  assert.match(dialog, /nextTick\(focusPhase\)/u);
  for (const marker of [
    "data-preference-list-focus",
    "data-preference-form-focus",
    "data-preference-proposal-focus",
  ]) assert.match(dialog, new RegExp(marker, "u"));
  assert.match(dialog, /event\.key === "Escape"/u);
  assert.match(dialog, /event\.key !== "Tab"/u);
  assert.match(dialog, /event\.shiftKey/u);
  assert.match(dialog, /event\.preventDefault\(\)/u);
  assert.match(dialog, /event\.stopPropagation\(\)/u);
  assert.match(dialog, /textarea:not\(:disabled\)/u);
});

test("Preference validation exposes invalid focus and live descriptions", async () => {
  const dialog = await source("components/PreferenceDialog.vue");
  assert.match(dialog, /aria-invalid/iu);
  assert.match(dialog, /aria-describedby/iu);
  assert.match(dialog, /role="alert" aria-live="assertive"/u);
  assert.match(dialog, /focusFirstInvalid/u);
});

test("Preference close restores only a still-connected opener", async () => {
  const lifecycle = await source("app/use-app-lifecycle.ts");
  assert.match(lifecycle, /preferenceTrigger\.value\?\.isConnected/u);
  assert.match(lifecycle, /preferenceTrigger\.value\.focus\(\)/u);
});
