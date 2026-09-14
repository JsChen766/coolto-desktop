import { join } from "node:path";

import { captureScreenshot, evaluate } from "./coolto-desktop-cdp.mjs";
import { screenshotDir } from "./coolto-desktop-session.mjs";

const SNAPSHOT_JS = `(() => {
  const visible = (el) => el.getClientRects().length > 0;
  const textOf = (el) => (el.innerText || el.getAttribute("aria-label") || "")
    .replace(/\\s+/g, " ").trim().slice(0, 120);
  let surface = "unknown";
  if (document.querySelector(".boot-screen")) surface = "boot";
  else if (document.querySelector(".privacy-card")) surface = "privacy";
  else if (document.querySelector(".login-screen")) surface = "login";
  else if (document.querySelector('[data-testid="chat-composer"]')) surface = "app";
  const testids = [...document.querySelectorAll("[data-testid]")]
    .filter(visible)
    .slice(0, 80)
    .map((el) => ({
      testid: el.getAttribute("data-testid"),
      tag: el.tagName.toLowerCase(),
      text: textOf(el),
      disabled: Boolean(el.disabled),
    }));
  const controls = [...document.querySelectorAll(
    "button, [role='button'], a, input, textarea, summary",
  )]
    .filter(visible)
    .slice(0, 60)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type") || "",
      testid: el.getAttribute("data-testid") || "",
      text: el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? (el.value || el.getAttribute("placeholder") || "")
        : textOf(el),
      disabled: Boolean(el.disabled),
    }));
  return {
    title: document.title,
    url: location.href,
    surface,
    hasCooltoApi: Boolean(window.coolto),
    testids,
    controls,
  };
})()`;

export async function readSnapshot(session) {
  return evaluate(session, SNAPSHOT_JS);
}

export async function clickTarget(session, options) {
  const result = await evaluate(session, clickScript(options));
  if (!result?.ok) {
    throw new Error(result?.error ?? "Click target was not found or not enabled");
  }
  return result;
}

export async function typeTarget(session, options) {
  if (!options.text && options.text !== "") {
    throw new Error("type requires --text");
  }
  const result = await evaluate(session, typeScript(options));
  if (!result?.ok) {
    throw new Error(result?.error ?? "Type target was not found or not enabled");
  }
  return result;
}

export async function setFileInput(session, filePath, testid = "chat-composer-file") {
  await session.send("DOM.enable");
  const documentNode = await session.send("DOM.getDocument", { depth: 0 });
  const input = await session.send("DOM.querySelector", {
    nodeId: documentNode.root.nodeId,
    selector: `[data-testid="${testid}"]`,
  });
  if (!input.nodeId) throw new Error(`File input not found: ${testid}`);
  await session.send("DOM.setFileInputFiles", {
    nodeId: input.nodeId,
    files: [filePath],
  });
  await evaluate(
    session,
    `document.querySelector(${JSON.stringify(`[data-testid="${testid}"]`)})?.dispatchEvent(new Event("change", { bubbles: true }))`,
  );
  return { ok: true, testid, filePath };
}

export async function saveScreenshot(session, outputPath) {
  const path = outputPath ?? join(screenshotDir, "latest.png");
  return captureScreenshot(session, path);
}

function locator(options) {
  if (options.testid) {
    return `document.querySelector(${JSON.stringify(`[data-testid="${options.testid}"]`)})`;
  }
  if (options.selector) {
    return `document.querySelector(${JSON.stringify(options.selector)})`;
  }
  return "null";
}

function clickScript(options) {
  if (options.text) {
    const needle = JSON.stringify(options.text);
    return `(() => {
      const needle = ${needle};
      const nodes = [...document.querySelectorAll("button, [role='button'], a, summary, label")];
      const hit = nodes.find((el) => {
        const text = (el.innerText || el.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim();
        return text === needle || text.includes(needle);
      });
      if (!hit) return { ok: false, error: "No control with that text" };
      if (hit.disabled) return { ok: false, error: "Control is disabled" };
      hit.click();
      return { ok: true, text: needle };
    })()`;
  }
  return `(() => {
    const el = ${locator(options)};
    if (!el) return { ok: false, error: "Element not found" };
    if (el.disabled) return { ok: false, error: "Element is disabled" };
    el.click();
    return { ok: true };
  })()`;
}

function typeScript(options) {
  const value = JSON.stringify(options.text);
  return `(() => {
    const el = ${locator(options)};
    if (!el) return { ok: false, error: "Element not found" };
    if (el.disabled) return { ok: false, error: "Element is disabled" };
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, ${value});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, value: el.value };
    }
    if (el.isContentEditable) {
      el.textContent = ${value};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return { ok: true, value: el.textContent };
    }
    return { ok: false, error: "Element is not editable" };
  })()`;
}
