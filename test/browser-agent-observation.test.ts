import assert from "node:assert/strict";
import test from "node:test";

import { readAccessibilityTree } from "../src/desktop/main/browser/browser-accessibility-reader.js";
import { queryBrowserElements } from "../src/desktop/main/browser/browser-agent-query.js";
import { waitForBrowserCondition } from "../src/desktop/main/browser/browser-agent-wait.js";
import { readBrowserObservation } from "../src/desktop/main/browser/browser-observation-reader.js";

test("element query requires a semantic condition and bounds results", async () => {
  await assert.rejects(
    queryBrowserElements({} as never, {}),
    /至少需要/u,
  );
  const contents = {
    executeJavaScript: async () => ({
      elements: Array.from({ length: 3 }, (_, index) => ({
        tagName: "button", role: "button", text: `Action ${index}`,
        label: "", inputType: "", disabled: false,
        framePath: [], shadowPath: [],
      })),
      truncated: true,
    }),
  };
  const result = await queryBrowserElements(contents as never, {
    role: "button", limit: 2,
  });
  assert.equal(result.elements.length, 2);
  assert.equal(result.truncated, true);
});

test("browser wait succeeds on load and honors cancellation", async () => {
  const contents = {
    isDestroyed: () => false,
    isLoading: () => false,
    isLoadingMainFrame: () => false,
    getURL: () => "https://jobs.example/ready",
    executeJavaScript: async () => true,
  };
  const elapsed = await waitForBrowserCondition(
    contents as never,
    { kind: "load", timeoutMs: 100 },
  );
  assert.ok(elapsed >= 0);

  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    waitForBrowserCondition(contents as never, { kind: "text", value: "x" }, abort.signal),
    /已取消/u,
  );
});

test("accessibility observation redacts protected values and detaches", async () => {
  let attached = false;
  const contents = {
    debugger: {
      isAttached: () => attached,
      attach: () => { attached = true; },
      detach: () => { attached = false; },
      sendCommand: async () => ({
        nodes: [
          {
            role: { value: "textbox" }, name: { value: "Password" },
            value: { value: "secret" },
            properties: [{ name: "protected", value: { value: true } }],
          },
          {
            role: { value: "textbox" }, name: { value: "OTP code" },
            value: { value: "123456" }, properties: [],
          },
        ],
      }),
    },
  };
  const result = await readAccessibilityTree(contents as never);
  assert.equal(result.nodes[0]?.value, "[REDACTED]");
  assert.equal(result.nodes[1]?.value, "[REDACTED]");
  assert.equal(attached, false);
});

test("mixed observation masks fields and bounds a CDP screenshot", async () => {
  let attached = false;
  let removed = false;
  const commands: string[] = [];
  const contents = {
    debugger: {
      isAttached: () => attached,
      attach: () => { attached = true; },
      detach: () => { attached = false; },
      sendCommand: async (command: string) => {
        commands.push(command);
        if (command === "Accessibility.getFullAXTree") return { nodes: [] };
        if (command === "Page.getLayoutMetrics") {
          return { cssVisualViewport: { clientWidth: 2000, clientHeight: 1000 } };
        }
        if (command === "Page.captureScreenshot") {
          return { data: Buffer.from("png").toString("base64") };
        }
        throw new Error(`unexpected command ${command}`);
      },
    },
    executeJavaScript: async () => null,
    insertCSS: async () => "css-key",
    removeInsertedCSS: async () => { removed = true; },
    capturePage: async () => { throw new Error("Viz capture must not be used"); },
  };
  const observation = await readBrowserObservation({
    contents: contents as never,
    tab: {
      id: "tab", title: "Jobs", url: "https://jobs.example",
      isActive: true, isLoading: false, canGoBack: false, canGoForward: false,
    },
    page: async () => ({
      url: "https://jobs.example", title: "Jobs", metaDescription: "",
      ogTitle: "", ogDescription: "", text: "Role", textTruncated: false,
      formFields: [],
    }),
    includeScreenshot: true,
  });
  assert.equal(observation.screenshot?.width, 1280);
  assert.equal(observation.screenshot?.height, 640);
  assert.deepEqual(commands, [
    "Accessibility.getFullAXTree",
    "Page.getLayoutMetrics",
    "Page.captureScreenshot",
  ]);
  assert.equal(removed, true);
  assert.equal(attached, false);
});

test("captcha observation never returns a screenshot to the model", async () => {
  let captured = false;
  let attached = false;
  const contents = {
    executeJavaScript: async () => ({ kind: "recaptcha" }),
    debugger: {
      isAttached: () => attached,
      attach: () => { attached = true; },
      detach: () => { attached = false; },
      sendCommand: async () => ({ nodes: [] }),
    },
    capturePage: async () => { captured = true; throw new Error("must not capture"); },
  };
  const observation = await readBrowserObservation({
    contents: contents as never,
    tab: {
      id: "tab", title: "Captcha", url: "https://jobs.example/captcha",
      isActive: true, isLoading: false, canGoBack: false, canGoForward: false,
    },
    page: async () => ({
      url: "https://jobs.example/captcha", title: "Captcha", metaDescription: "",
      ogTitle: "", ogDescription: "", text: "Verify", textTruncated: false,
      formFields: [],
    }),
    includeScreenshot: true,
  });
  assert.equal(captured, false);
  assert.equal(observation.screenshot, undefined);
  assert.equal(observation.screenshotBlockedReason, "captcha_detected");
});
