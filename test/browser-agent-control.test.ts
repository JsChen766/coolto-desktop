import assert from "node:assert/strict";
import test from "node:test";

import type {
  BrowserAgentController,
  BrowserAgentTab,
} from "../src/browser/agent-control-types.js";
import { normalizeAgentNavigationUrl } from "../src/desktop/main/browser/browser-agent-navigation.js";
import { normalizeAgentKeypress } from "../src/desktop/main/browser/browser-agent-interactions.js";
import { buildClickScript } from "../src/desktop/main/browser/browser-writer-actions.js";
import { createBrowserControlTools } from "../src/tools/browser/index.js";
import { createToolRegistry } from "../src/tools/registry.js";
import { runWriteOperation } from "../src/tools/browser/write-tool-helpers.js";

const activeTab: BrowserAgentTab = {
  id: "tab-1",
  title: "Jobs",
  url: "https://jobs.example/",
  isActive: true,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
};

function controller(calls: string[] = []): BrowserAgentController {
  const act = (name: string): BrowserAgentTab => {
    calls.push(name);
    return activeTab;
  };
  return {
    listTabs: () => [activeTab],
    getActiveTab: () => activeTab,
    newTab: (url) => act(`new:${url ?? ""}`),
    selectTab: (id) => act(`select:${id}`),
    closeTab: (id) => {
      calls.push(`close:${id}`);
      return null;
    },
    navigate: (url) => act(`navigate:${url}`),
    goBack: () => act("back"),
    goForward: () => act("forward"),
    reload: () => act("reload"),
    readActivePage: async () => ({
      url: activeTab.url!, title: activeTab.title, metaDescription: "",
      ogTitle: "", ogDescription: "", text: "Jobs", textTruncated: false,
      formFields: [],
    }),
    waitFor: async () => ({ condition: "load", elapsedMs: 0, tab: activeTab }),
    queryElements: async () => ({ elements: [], truncated: false }),
    snapshot: async () => ({
      tab: activeTab,
      page: await controller().readActivePage(),
      accessibility: [],
      accessibilityTruncated: false,
    }),
    keypress: async (input) => { calls.push(`key:${input.key}`); },
    hover: async (fillId) => { calls.push(`hover:${fillId}`); },
    drag: async (source, target) => { calls.push(`drag:${source}:${target}`); },
    download: async (url) => ({
      filename: "file.txt", sourceUrl: url, status: "completed",
      receivedBytes: 1, totalBytes: 1, completedAt: new Date().toISOString(),
    }),
    submitElement: async (fillId) => { calls.push(`submit:${fillId}`); },
  };
}

test("agent navigation accepts only credential-free HTTP(S) URLs", () => {
  assert.equal(
    normalizeAgentNavigationUrl("https://jobs.example/search?q=agent"),
    "https://jobs.example/search?q=agent",
  );
  assert.equal(
    normalizeAgentNavigationUrl("https://outlook.live.com"),
    "https://outlook.live.com/mail/0/",
  );
  assert.equal(
    normalizeAgentNavigationUrl("https://outlook.live.com/?source=manual"),
    "https://outlook.live.com/?source=manual",
  );
  for (const value of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,hello",
    "https://user:secret@jobs.example/",
    "jobs.example/search",
  ]) {
    assert.throws(() => normalizeAgentNavigationUrl(value));
  }
});

test("agent keypress rejects submit-equivalent keys", () => {
  assert.deepEqual(normalizeAgentKeypress({ key: "ArrowDown" }), {
    key: "ArrowDown", modifiers: [],
  });
  assert.deepEqual(normalizeAgentKeypress({ key: "a", modifiers: ["shift", "shift"] }), {
    key: "a", modifiers: ["shift"],
  });
  for (const key of ["Enter", "NumpadEnter", "Space", " "]) {
    assert.throws(() => normalizeAgentKeypress({ key }));
  }
});

test("browser click promotes only non-interactive descendants to safe row roles", () => {
  const read = buildClickScript("fill-1", "read");
  const click = buildClickScript("fill-1", "click");
  assert.match(read, /ownInteractive/u);
  assert.match(read, /\[role="option"\]/u);
  assert.match(click, /target\.click\(\)/u);
  assert.match(click, /'BUTTON','A','INPUT','SELECT','TEXTAREA'/u);
});

test("browser control tools expose atomic tab and navigation actions", async () => {
  const calls: string[] = [];
  const tools = createBrowserControlTools(controller(calls));
  assert.deepEqual(tools.map((tool) => tool.name), [
    "browser_list_tabs", "browser_get_active_tab", "browser_new_tab",
    "browser_select_tab", "browser_close_tab", "browser_navigate",
    "browser_go_back", "browser_go_forward", "browser_reload",
    "browser_wait_for", "browser_query_elements", "browser_snapshot",
    "browser_keypress", "browser_hover", "browser_drag",
    "browser_download",
  ]);

  await tools.find((tool) => tool.name === "browser_select_tab")!
    .execute("select", { tabId: "tab-1" });
  await tools.find((tool) => tool.name === "browser_navigate")!
    .execute("navigate", { url: "https://jobs.example/next" });
  assert.deepEqual(calls, [
    "select:tab-1",
    "navigate:https://jobs.example/next",
  ]);
});

test("registry keeps visible browser control actions sequential", () => {
  const browser = controller();
  const tools = createToolRegistry({
    browserPageReader: browser,
    browserAgentController: browser,
    browserPageOperator: {} as never,
    approvalManager: {} as never,
  });
  const controlNames = new Set([
    "browser_new_tab", "browser_select_tab", "browser_close_tab",
    "browser_navigate", "browser_go_back", "browser_go_forward",
    "browser_reload", "browser_wait_for", "browser_query_elements",
    "browser_snapshot", "browser_keypress", "browser_hover", "browser_drag",
    "browser_download",
  ]);
  const controls = tools.filter((tool) => controlNames.has(tool.name));
  assert.equal(controls.length, controlNames.size);
  assert.ok(controls.every((tool) => tool.executionMode === "sequential"));
});

test("browser tool failures reject so Pi records a real tool error", async () => {
  const failing = controller();
  failing.navigate = () => { throw new Error("control denied"); };
  const navigate = createBrowserControlTools(failing)
    .find((tool) => tool.name === "browser_navigate")!;
  await assert.rejects(
    navigate.execute("navigate", { url: "https://jobs.example" }),
    /control denied/u,
  );

  await assert.rejects(
    runWriteOperation(
      { checkWriteAccess: () => ({ ok: false, message: "not granted" }) } as never,
      async () => undefined,
      () => ({ content: [{ type: "text", text: "ok" }], details: {} }),
    ),
    /not granted/u,
  );
});
