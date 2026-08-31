import assert from "node:assert/strict";
import test from "node:test";

import type { WebContents } from "electron";

import {
  buildTargetHighlightClearScript,
  buildTargetHighlightScript,
  runWithBrowserTargetHighlight,
} from "../src/desktop/main/browser/browser-target-highlight.js";
import {
  fillPageField,
  performPageClick,
  scrollPageToElement,
} from "../src/desktop/main/browser/browser-content-writer.js";

test("target highlight is fill-id-only visual feedback with bounded lifetime", () => {
  const script = buildTargetHighlightScript('field-"one', "token-1");
  assert.doesNotThrow(() => Function(script));
  assert.ok(script.includes('findEl("field-\\"one")'));
  assert.match(script, /data-coolto-agent-target/u);
  assert.match(script, /pointerEvents: 'none'/u);
  assert.match(script, /setTimeout\(clear, 450\)/u);
  assert.match(script, /!target\.isConnected/u);
  assert.match(script, /rect\.top < view\.innerHeight/u);
  assert.match(script, /if \(!inViewport\(rect\)\) \{ clear\(\); return; \}/u);
  assert.match(script, /getComputedStyle\(marker\)/u);
  assert.match(script, /rendered\.position !== 'fixed'/u);
  assert.doesNotMatch(script, /elementFromPoint|sendInputEvent|scrollIntoView|\.click\(/u);
  assert.match(buildTargetHighlightClearScript("token-1"), /state\.token === "token-1"/u);
});

test("click target highlight mirrors the existing semantic ancestor promotion", () => {
  const script = buildTargetHighlightScript("child-1", "token-2", true);
  assert.doesNotThrow(() => Function(script));
  assert.match(script, /ownInteractive \? tagged/u);
  assert.match(script, /\[role="row"\]/u);
  assert.doesNotMatch(script, /elementFromPoint|sendInputEvent|scrollIntoView|\.click\(/u);
});

test("missing or inaccessible highlight does not delay or replace the real action", async () => {
  const calls: string[] = [];
  const contents = {
    executeJavaScript: async () => {
      calls.push("highlight");
      return false;
    },
  } as unknown as WebContents;
  const result = await runWithBrowserTargetHighlight(
    contents,
    "cross-frame-target",
    async () => { calls.push("action"); return "real-result"; },
    async () => { calls.push("wait"); },
  );
  assert.equal(result, "real-result");
  assert.deepEqual(calls, ["highlight", "action"]);
});

test("highlight cleanup preserves the exact action outcome", async () => {
  const calls: string[] = [];
  const contents = {
    executeJavaScript: async (script: string) => {
      calls.push(script.includes("data-coolto-agent-target") ? "highlight" : "clear");
      if (calls.at(-1) === "clear") throw new Error("page navigated");
      return true;
    },
  } as unknown as WebContents;
  const failure = new Error("element_not_found");
  await assert.rejects(
    runWithBrowserTargetHighlight(
      contents,
      "target-1",
      async () => { calls.push("action"); throw failure; },
      async (durationMs) => { calls.push(`wait:${durationMs}`); },
    ),
    (error) => error === failure,
  );
  assert.deepEqual(calls, ["highlight", "wait:340", "action", "clear"]);
});

test("highlight injection failure still returns the real action result", async () => {
  const contents = {
    executeJavaScript: async () => { throw new Error("renderer gone"); },
  } as unknown as WebContents;
  assert.equal(await runWithBrowserTargetHighlight(
    contents, "target-2", async () => 42, async () => undefined,
  ), 42);
});

test("fill, click, and scroll all attempt the cue before their semantic action", async () => {
  const operations = [
    () => fillPageField(contents, "field-1", "Ada"),
    () => performPageClick(contents, "button-1"),
    () => scrollPageToElement(contents, "section-1"),
  ];
  let scripts: string[] = [];
  const contents = {
    executeJavaScript: async (script: string) => {
      scripts.push(script);
      if (script.includes("data-coolto-agent-target")) return false;
      return {
        ok: true, valueBefore: "", valueAfter: "Ada",
        label: "Name", elementType: "input",
      };
    },
  } as unknown as WebContents;
  for (const operation of operations) {
    scripts = [];
    await operation();
    assert.equal(scripts.length, 2);
    assert.match(scripts[0]!, /data-coolto-agent-target/u);
    assert.match(scripts[1]!, /findEl/u);
  }
});
