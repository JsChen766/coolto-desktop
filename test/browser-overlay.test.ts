import assert from "node:assert/strict";
import test from "node:test";

import type { WebContents } from "electron";

import type { BrowserFieldWriteRecord } from "../src/browser/types.js";
import {
  BROWSER_OVERLAY_WORLD_ID,
  injectOverlay,
  pollOverlay,
  removeOverlay,
} from "../src/desktop/main/browser/browser-overlay-injector.js";
import { BrowserOverlayPoller } from "../src/desktop/main/browser/browser-overlay-poller.js";
import {
  buildOverlayCss,
  buildOverlayInjectScript,
  buildOverlayPollScript,
  buildOverlayRemoveScript,
} from "../src/desktop/main/browser/browser-overlay-scripts.js";
import {
  browserOverlayRectCoversViewport,
  browserOverlayTopBarCoversViewport,
} from "../src/desktop/main/browser/browser-overlay-viewport.js";

const records: BrowserFieldWriteRecord[] = [
  {
    fillId: 'field-"name', label: "姓名", elementType: "input",
    valueBefore: "Old", valueAfter: "Ada", writtenAt: "2026-08-30T00:00:00Z",
  },
  {
    fillId: "field-role", label: "角色", elementType: "select",
    valueBefore: "工程师", valueAfter: "经理", writtenAt: "2026-08-30T00:00:01Z",
  },
];
const presentation = { locale: "zh-CN", theme: "light" } as const;

test("1.25 DPR coverage follows the visual viewport with a one-physical-pixel cap", () => {
  const viewport = { left: 0, top: 0, right: 1164.800048828125, bottom: 730.4 };
  assert.equal(browserOverlayRectCoversViewport({
    ...viewport,
  }, viewport, 1.25), true);
  assert.equal(browserOverlayRectCoversViewport({
    ...viewport, right: viewport.right - 0.79,
  }, viewport, 1.25), true);
  assert.equal(browserOverlayRectCoversViewport({
    ...viewport, right: viewport.right - 0.81,
  }, viewport, 1.25), false);
  assert.equal(browserOverlayTopBarCoversViewport({
    left: 0, top: 0, right: viewport.right, bottom: 40, height: 40,
  }, viewport, 1.25), true);
});

test("review overlay is accessible, restrained, and keeps review semantics", () => {
  const script = buildOverlayInjectScript(records, "zh-CN");
  const lightCss = buildOverlayCss("light");
  const darkCss = buildOverlayCss("dark");
  assert.doesNotThrow(() => Function(script));
  assert.match(lightCss, /#f1f1ef/u);
  assert.match(lightCss, /#356fca/u);
  assert.match(lightCss, /color-scheme:light/u);
  assert.match(darkCss, /#252523/u);
  assert.match(darkCss, /#78a7f5/u);
  assert.match(darkCss, /color-scheme:dark/u);
  assert.match(lightCss, /button\.danger/u);
  assert.match(lightCss, /done-accept/u);
  assert.match(script, /已接受/u);
  assert.match(script, /已拒绝/u);
  assert.match(script, /待审核/u);
  assert.match(lightCss, /focus-visible/u);
  assert.match(lightCss, /prefers-reduced-motion/u);
  assert.match(lightCss, /forced-colors/u);
  assert.match(lightCss, /position:fixed!important/u);
  assert.match(script, /aria-live/u);
  assert.match(script, /aria-pressed/u);
  assert.match(script, /event\.key !== 'Tab'/u);
  assert.match(script, /ResizeObserver/u);
  assert.match(script, /MutationObserver/u);
  assert.match(script, /event\.isTrusted/u);
  assert.equal(script.match(/trustedButton\(event/gu)?.length, 4);
  assert.match(script, /reason: 'style_blocked:' \+ styleFailures\.join/u);
  assert.match(script, /mask\.position/u);
  assert.match(script, /toolbar\.marker/u);
  assert.match(script, /await waitForOverlayStyles/u);
  assert.match(script, /attempt < 4/u);
  assert.match(script, /const offscreen =/u);
  assert.match(script, /button\.textContent !== text/u);
  assert.match(script, /rect\.width >= minWidth/u);
  assert.doesNotMatch(lightCss, /opacity:\.35|#22c55e/u);
  assert.doesNotMatch(script + lightCss, /ipcRenderer|require\(['"]electron|preload/iu);

  assert.match(script, /const rejectValue = \(record\) => restoreValue\(record\)/u);
  assert.match(script, /state\.decisions\[entry\.record\.fillId\] !== 'rejected'/u);
  assert.match(script, /restoreValue\(entry\.record\); setDecision\(entry, 'rejected'\)/u);
  assert.match(script, /const isSelect = target\.tagName === 'SELECT'/u);
  assert.match(script, /record\.elementType === 'contenteditable'/u);
});

test("review overlay copy follows the Browser presentation locale", () => {
  const english = buildOverlayInjectScript(records, "en-US");
  assert.match(english, /Fill review/u);
  assert.match(english, /Review each change/u);
  assert.match(english, /Accept all/u);
  assert.match(english, /Reject all/u);
  assert.match(english, /Pending/u);
  assert.doesNotMatch(english, /填写审核|全部接受|待审核/u);
});

test("malicious fill ids remain own keys without prototype mutation", async () => {
  const malicious = [{ ...records[0]!, fillId: "__proto__" }];
  const inject = buildOverlayInjectScript(malicious, "zh-CN");
  const poll = buildOverlayPollScript();
  assert.match(inject, /decisions: Object\.create\(null\)/u);
  assert.match(poll, /Object\.prototype\.hasOwnProperty\.call/u);

  const raw = Object.create(null) as Record<string, string>;
  raw.__proto__ = "accepted";
  const contents = {
    executeJavaScriptInIsolatedWorld: async () => ({
      decisions: raw, globalAction: "auto",
    }),
  } as unknown as WebContents;
  const snapshot = await pollOverlay(contents);
  assert.equal(Object.getPrototypeOf(snapshot!.decisions), null);
  assert.equal(Object.hasOwn(snapshot!.decisions, "__proto__"), true);
  assert.equal(snapshot!.decisions.__proto__, "accepted");
});

test("review overlay cleanup removes listeners and restores page state", () => {
  const inject = buildOverlayInjectScript(records, "zh-CN");
  const remove = buildOverlayRemoveScript();
  const poll = buildOverlayPollScript();
  assert.doesNotThrow(() => Function(remove));
  assert.doesNotThrow(() => Function(poll));
  assert.match(inject, /removeEventListener\('scroll'/u);
  assert.match(inject, /removeEventListener\('resize'/u);
  assert.match(inject, /removeEventListener\('keydown'/u);
  assert.match(inject, /resizeObserver\?\.disconnect/u);
  assert.match(inject, /mutationObserver\?\.disconnect/u);
  assert.match(inject, /document\.body\.style\.paddingTop = previousBodyPaddingTop/u);
  assert.match(inject, /previousFocus\.focus/u);
  assert.match(remove, /typeof state\.cleanup === 'function'/u);
  assert.match(remove, /delete window\["__coolto_review"\]/u);
  assert.match(poll, /entry\.badge\.isConnected/u);
  assert.match(poll, /maskStyle\.position !== 'fixed'/u);
  assert.match(poll, /interactive\(state\.acceptAll/u);
  assert.match(poll, /entry\.accept\.textContent !== copy\.accept/u);
});

test("injector fails closed on blocked style and removes partial artifacts", async () => {
  const worlds: number[] = [];
  const removedCss: string[] = [];
  let scriptCount = 0;
  const failed = {
    insertCSS: async () => "css-key",
    removeInsertedCSS: async (key: string) => { removedCss.push(key); },
    executeJavaScriptInIsolatedWorld: async (worldId: number) => {
      worlds.push(worldId);
      scriptCount += 1;
      return scriptCount === 1 ? { ok: false, reason: "style_blocked" } : { ok: true };
    },
  } as unknown as WebContents;
  await assert.rejects(injectOverlay(failed, records, presentation), /style_blocked/u);
  assert.deepEqual(worlds, [BROWSER_OVERLAY_WORLD_ID, BROWSER_OVERLAY_WORLD_ID]);
  assert.deepEqual(removedCss, ["css-key"]);
});

test("injector binds dark English presentation and removes its CSS key", async () => {
  let insertedCss = "";
  let injectedScript = "";
  const removedCss: string[] = [];
  const contents = {
    insertCSS: async (css: string) => { insertedCss = css; return "dark-css"; },
    removeInsertedCSS: async (key: string) => { removedCss.push(key); },
    executeJavaScriptInIsolatedWorld: async (
      worldId: number,
      sources: Array<{ code: string }>,
    ) => {
      assert.equal(worldId, BROWSER_OVERLAY_WORLD_ID);
      injectedScript = sources[0]!.code;
      return injectedScript.includes("const RECORDS =")
        ? { ok: true, injectedCount: 2 } : { ok: true };
    },
  } as unknown as WebContents;
  const result = await injectOverlay(contents, records, {
    locale: "en-US", theme: "dark",
  });
  assert.match(insertedCss, /#252523/u);
  assert.match(insertedCss, /#78a7f5/u);
  assert.match(injectedScript, /Review each change/u);
  await removeOverlay(contents, result.cssKey);
  assert.deepEqual(removedCss, ["dark-css"]);
});

test("main-world spoof state cannot affect the isolated review snapshot", async () => {
  let mainWorldCalled = false;
  const contents = {
    executeJavaScript: async () => {
      mainWorldCalled = true;
      return { decisions: { "field-name": "accepted" }, globalAction: "accept_all" };
    },
    executeJavaScriptInIsolatedWorld: async (
      worldId: number,
      sources: Array<{ code: string }>,
    ) => {
      assert.equal(worldId, BROWSER_OVERLAY_WORLD_ID);
      assert.match(sources[0]!.code, /state\.mask/u);
      return {
      decisions: {
        "field-name": "accepted",
        "field-role": "tampered",
        "__proto__": "rejected",
      },
      globalAction: "forged",
      };
    },
  } as unknown as WebContents;
  const snapshot = await pollOverlay(contents);
  assert.deepEqual({ ...snapshot!.decisions }, { "field-name": "accepted" });
  assert.equal(snapshot!.globalAction, null);
  assert.equal(mainWorldCalled, false);
});

test("poller emits and counts only records from the active review", async () => {
  const calls: string[] = [];
  const contents = fakeContents(async (kind) => {
    calls.push(kind);
    if (kind === "inject") return { ok: true, injectedCount: 2 };
    if (kind === "remove") return { ok: true };
    return {
      decisions: {
        [records[0]!.fillId]: "accepted",
        [records[1]!.fillId]: "rejected",
        "page-forged-id": "accepted",
      },
      globalAction: "auto",
    };
  });
  const decisions: string[] = [];
  const outcomes: unknown[] = [];
  const errors: string[] = [];
  const poller = new BrowserOverlayPoller();
  await poller.start(contents, records, presentation, {
    onDecision: (fillId, decision) => decisions.push(`${fillId}:${decision}`),
    onComplete: (outcome) => outcomes.push(outcome),
    onError: (message) => errors.push(message),
  });
  await waitFor(() => outcomes.length === 1);
  assert.deepEqual(decisions, [
    `${records[0]!.fillId}:accepted`, `${records[1]!.fillId}:rejected`,
  ]);
  assert.deepEqual(outcomes, [{ action: "mixed", acceptedCount: 1, rejectedCount: 1 }]);
  assert.deepEqual(errors, []);
  assert.equal(poller.isActive(), false);
  assert.equal(calls.filter((call) => call === "remove").length, 1);
});

test("poller stops once when the page loses overlay state", async () => {
  let errors = 0;
  let removes = 0;
  const contents = fakeContents(async (kind) => {
    if (kind === "inject") return { ok: true, injectedCount: 2 };
    if (kind === "remove") { removes += 1; return { ok: true }; }
    return null;
  });
  const poller = new BrowserOverlayPoller();
  await poller.start(contents, records, presentation, {
    onDecision: () => undefined,
    onComplete: () => assert.fail("missing overlay must not complete"),
    onError: (message) => {
      assert.equal(message, "overlay_state_unavailable");
      errors += 1;
    },
  });
  await waitFor(() => errors === 1);
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(errors, 1);
  assert.equal(removes, 1);
  assert.equal(poller.isActive(), false);
});

test("stopping during injection cannot leave a zombie poll timer", async () => {
  let finishInjection: ((value: unknown) => void) | undefined;
  let polls = 0;
  let removes = 0;
  const contents = fakeContents(async (kind) => {
    if (kind === "inject") {
      return new Promise((resolve) => { finishInjection = resolve; });
    }
    if (kind === "remove") { removes += 1; return { ok: true }; }
    polls += 1;
    return null;
  });
  const poller = new BrowserOverlayPoller();
  const starting = poller.start(contents, records, presentation, {
    onDecision: () => undefined,
    onComplete: () => assert.fail("cancelled injection must not complete"),
    onError: () => assert.fail("cancelled injection must not report a page error"),
  });
  await waitFor(() => finishInjection !== undefined);
  assert.equal(poller.isActive(), true);
  await poller.stop("cancel");
  finishInjection?.({ ok: true, injectedCount: 2 });
  await starting;
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(poller.isActive(), false);
  assert.equal(polls, 0);
  assert.equal(removes, 2);
});

function fakeContents(
  execute: (kind: "inject" | "poll" | "remove") => Promise<unknown>,
): WebContents {
  return {
    isDestroyed: () => false,
    insertCSS: async (css: string, options: { cssOrigin?: string }) => {
      assert.match(css, /--coolto-review-style/u);
      assert.equal(options.cssOrigin, "author");
      return "overlay-css-key";
    },
    removeInsertedCSS: async (key: string) => {
      assert.equal(key, "overlay-css-key");
    },
    executeJavaScriptInIsolatedWorld: async (
      worldId: number,
      sources: Array<{ code: string }>,
      userGesture: boolean,
    ) => {
      assert.equal(worldId, BROWSER_OVERLAY_WORLD_ID);
      assert.equal(userGesture, false);
      const script = sources[0]!.code;
      return execute(script.includes("const RECORDS =") ? "inject"
        : script.includes("typeof state.cleanup") ? "remove" : "poll");
    },
  } as unknown as WebContents;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_500;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail("timed out waiting for overlay poller");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
