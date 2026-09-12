import type { BrowserWindow } from "electron";

export async function bodyText(window: BrowserWindow): Promise<string> {
  return window.webContents.executeJavaScript("document.body.innerText", true);
}

export async function clickText(window: BrowserWindow, value: string): Promise<void> {
  await window.webContents.executeJavaScript(`(() => {
    const target = ${JSON.stringify(value)};
    const button = [...document.querySelectorAll("button")]
      .find((item) => item.textContent?.trim() === target);
    if (!button) throw new Error("button not found: " + target);
    button.click();
  })()`, true);
  await pause(80);
}

export async function clickNav(window: BrowserWindow, id: string): Promise<void> {
  await window.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-settings-nav="${id}"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error("nav missing: ${id}");
    button.click();
  })()`, true);
  await pause(60);
}

export async function waitFor(window: BrowserWindow, selector: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 8_000) {
    if (await window.webContents.executeJavaScript(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`, true,
    )) return;
    await pause(50);
  }
  throw new Error(`selector timeout: ${selector}`);
}

export async function waitText(window: BrowserWindow, value: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 8_000) {
    if ((await bodyText(window)).includes(value)) return;
    await pause(50);
  }
  throw new Error(`text timeout: ${value}`);
}

export async function clickElement(window: BrowserWindow, selector: string): Promise<void> {
  const rect = await window.webContents.executeJavaScript(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) throw new Error("element missing: " + ${JSON.stringify(selector)});
    element.scrollIntoView({ block: "center" });
    const box = element.getBoundingClientRect();
    return { x: Math.floor(box.left + box.width / 2), y: Math.floor(box.top + box.height / 2) };
  })()`, true) as { x: number; y: number };
  await window.webContents.sendInputEvent({ type: "mouseMove", x: rect.x, y: rect.y });
  await window.webContents.sendInputEvent({
    type: "mouseDown", x: rect.x, y: rect.y, button: "left", clickCount: 1,
  });
  await window.webContents.sendInputEvent({
    type: "mouseUp", x: rect.x, y: rect.y, button: "left", clickCount: 1,
  });
  await pause(80);
}

export async function openDialogSelect(window: BrowserWindow, rootSelector: string): Promise<string> {
  const triggerSelector = `${rootSelector} .dialog-select-trigger`;
  await clickElement(window, triggerSelector);
  return window.webContents.executeJavaScript(`(() => {
    const root = document.querySelector(${JSON.stringify(rootSelector)});
    const started = Date.now();
    let option = null;
    while (Date.now() - started < 4_000) {
      option = document.querySelector(".dialog-select-menu .dialog-select-option:not(:disabled)");
      if (option instanceof HTMLButtonElement) break;
      option = null;
    }
    if (!(option instanceof HTMLButtonElement)) {
      const trigger = root?.querySelector(".dialog-select-trigger");
      throw new Error(JSON.stringify({
        reason: "dialog select menu missing",
        expanded: trigger instanceof HTMLButtonElement ? trigger.getAttribute("aria-expanded") : null,
        menuCount: document.querySelectorAll(".dialog-select-menu").length,
        optionCount: document.querySelectorAll(".dialog-select-option").length,
      }));
    }
    const label = option.textContent?.trim() ?? "";
    return label;
  })()`, true).then(async (label: string) => {
    await clickElement(window, ".dialog-select-menu .dialog-select-option:not(:disabled)");
    return label;
  });
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
