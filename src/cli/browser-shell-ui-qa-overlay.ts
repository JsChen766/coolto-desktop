import type { BrowserWindow, WebContents } from "electron";

import type { BrowserFieldWriteRecord } from "../browser/types.js";
import type { BrowserWindowManager } from
  "../desktop/main/browser/browser-window-manager.js";
import {
  injectOverlay, pollOverlay, removeOverlay,
} from "../desktop/main/browser/browser-overlay-injector.js";
import { captureActivePage, setBrowserWindow } from
  "./browser-shell-ui-qa-capture.js";
import type { BrowserShellFixture } from "./browser-shell-ui-qa-fixture.js";
import { waitForQa } from "./browser-shell-ui-qa-wait.js";

type Expect = (name: string, passed: boolean) => void;
const RECORDS: BrowserFieldWriteRecord[] = [
  { fillId: "qa-name", label: "Name", elementType: "input",
    valueBefore: "Old", valueAfter: "Ada", writtenAt: "2026-08-30T00:00:00Z" },
  { fillId: "qa-role", label: "Role", elementType: "input",
    valueBefore: "Analyst", valueAfter: "Engineer", writtenAt: "2026-08-30T00:00:01Z" },
];

export async function runBrowserShellOverlayQa(input: {
  artifacts: string;
  browser: BrowserWindow;
  expect: Expect;
  fixture: BrowserShellFixture;
  manager: BrowserWindowManager;
}): Promise<Record<string, unknown>> {
  const { artifacts, browser, expect, fixture, manager } = input;
  const captures: Record<string, unknown> = {};
  const tab = manager.tabs!.activeTab()!;
  const contents = tab.view.webContents;
  await setBrowserWindow(browser, 1180, 820, 1);
  tab.navigate(`${fixture.baseUrl}/overlay`);
  await waitForQa(() => tab.getState().url === `${fixture.baseUrl}/overlay` &&
    !tab.getState().isLoading, "the real Overlay fixture");
  await prepareFixture(contents);

  const lightInjection = await injectOverlay(contents, RECORDS, {
    locale: "zh-CN", theme: "light",
  });
  await waitForQa(async () => (await pollOverlay(contents)) !== null,
    "the isolated light Overlay state");
  const initial = await inspectOverlay(contents);
  const isolated = await pollOverlay(contents);
  expect("BSF3-OVL-01 isolated host Overlay ignores main-world spoof",
    lightInjection.injectedCount === 2 && isolated?.globalAction === null &&
    isolated.decisions["qa-name"] === "pending" &&
    initial.maskPosition === "fixed" && initial.maskPointerEvents !== "none");

  await contents.executeJavaScript(
    "document.querySelector('[data-coolto-review-badge=qa-name] .accept')?.click(); true",
    true,
  );
  await delay(80);
  const synthetic = await pollOverlay(contents);
  expect("BSF3-OVL-02 synthetic element click cannot approve a field",
    synthetic?.decisions["qa-name"] === "pending");

  await clickReviewButton(browser, contents,
    "[data-coolto-review-badge=qa-name] .accept");
  await waitForQa(async () => (await pollOverlay(contents))
    ?.decisions["qa-name"] === "accepted", "trusted Overlay field approval");
  const trusted = await pollOverlay(contents);
  expect("BSF3-OVL-03 trusted mouse click approves only the intended field",
    trusted?.decisions["qa-name"] === "accepted" &&
    trusted.decisions["qa-role"] === "pending" && trusted.globalAction === null);

  const light = await inspectOverlay(contents);
  captures.overlayLight = { injection: lightInjection, inspection: light };
  captures.overlayLightImage = await captureActivePage(
    manager.tabs!, artifacts, "23-bsf3-overlay-light-zh.png",
  );
  expect("BSF3-OVL-04 light zh Overlay exposes expected DOM and computed style",
    light.toolbarLabel === "填写审核" && light.copy.includes("逐项审核") &&
    light.toolbarBackground === "rgb(241, 241, 239)" && light.colorScheme === "light");

  const initiallyHidden = light.roleBadgeHidden;
  await contents.executeJavaScript(
    "document.querySelector('[data-fill-id=qa-role]')?.scrollIntoView({block:'center'}); true",
    true,
  );
  await waitForQa(async () => !(await inspectOverlay(contents)).roleBadgeHidden,
    "offscreen Overlay badge to return");
  const scrolled = await inspectOverlay(contents);
  captures.overlayScrolledImage = await captureActivePage(
    manager.tabs!, artifacts, "24-bsf3-overlay-scrolled.png",
  );
  expect("BSF3-OVL-05 offscreen badge hides and returns when scrolled into view",
    initiallyHidden && !scrolled.roleBadgeHidden);
  await removeOverlay(contents, lightInjection.cssKey);

  await contents.executeJavaScript("scrollTo(0, 0); true", true);
  await prepareFixture(contents);
  const darkInjection = await injectOverlay(contents, RECORDS, {
    locale: "en-US", theme: "dark",
  });
  await waitForQa(async () => (await pollOverlay(contents)) !== null,
    "the isolated dark Overlay state");
  const dark = await inspectOverlay(contents);
  captures.overlayDark = { injection: darkInjection, inspection: dark };
  captures.overlayDarkImage = await captureActivePage(
    manager.tabs!, artifacts, "25-bsf3-overlay-dark-en.png",
  );
  expect("BSF3-OVL-06 dark en Overlay exposes expected DOM and computed style",
    dark.toolbarLabel === "Fill review" && dark.copy.includes("Review each change") &&
    dark.toolbarBackground === "rgb(37, 37, 35)" && dark.colorScheme === "dark");

  await removeOverlay(contents, darkInjection.cssKey);
  await waitForQa(async () => (await inspectCleanup(contents)).probeStyleRemoved,
    "Overlay host CSS removal");
  const cleanup = await inspectCleanup(contents);
  captures.overlayCleanup = cleanup;
  expect("BSF3-OVL-07 Overlay host CSS removal clears DOM padding and restores focus",
    cleanup.domCount === 0 && cleanup.bodyPadding === "7px" &&
    cleanup.focusId === "overlay-previous-focus" && cleanup.probeStyleRemoved &&
    await pollOverlay(contents) === null);
  return captures;
}

async function prepareFixture(contents: WebContents): Promise<void> {
  await contents.executeJavaScript(`(() => {
    document.body.style.paddingTop = '7px';
    const focus = document.querySelector('#overlay-previous-focus');
    focus?.focus();
    return document.activeElement === focus;
  })()`, true);
}

async function inspectOverlay(contents: WebContents): Promise<{
  colorScheme: string; copy: string; maskPointerEvents: string; maskPosition: string;
  roleBadgeHidden: boolean; toolbarBackground: string; toolbarLabel: string | null;
}> {
  return contents.executeJavaScript(`(() => {
    const mask = document.querySelector('#__coolto_review_mask');
    const toolbar = document.querySelector('#__coolto_review_toolbar');
    const role = document.querySelector('[data-coolto-review-badge=qa-role]');
    const maskStyle = getComputedStyle(mask);
    const toolbarStyle = getComputedStyle(toolbar);
    return {
      colorScheme: toolbarStyle.colorScheme,
      copy: toolbar?.textContent || '',
      maskPointerEvents: maskStyle.pointerEvents,
      maskPosition: maskStyle.position,
      roleBadgeHidden: Boolean(role?.hidden),
      toolbarBackground: toolbarStyle.backgroundColor,
      toolbarLabel: toolbar?.getAttribute('aria-label') || null,
    };
  })()`, true) as Promise<any>;
}

async function clickReviewButton(
  browser: BrowserWindow, contents: WebContents, selector: string,
): Promise<void> {
  const point = await contents.executeJavaScript(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const rect = element?.getBoundingClientRect();
    return rect ? { x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2) } : null;
  })()`, true) as { x: number; y: number } | null;
  if (!point) throw new Error("trusted Overlay target is unavailable");
  browser.focus(); contents.focus();
  contents.sendInputEvent({ type: "mouseMove", ...point });
  contents.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
  contents.sendInputEvent({ type: "mouseUp", ...point, button: "left", clickCount: 1 });
}

async function inspectCleanup(contents: WebContents): Promise<{
  bodyPadding: string; domCount: number; focusId: string; probeStyleRemoved: boolean;
}> {
  return contents.executeJavaScript(`(() => {
    const domCount = document.querySelectorAll(
      '#__coolto_review_mask,#__coolto_review_toolbar,[data-coolto-review-badge]').length;
    const probe = document.createElement('div');
    probe.id = '__coolto_review_mask'; document.body.append(probe);
    const style = getComputedStyle(probe);
    const probeStyleRemoved = style.position !== 'fixed' &&
      !style.getPropertyValue('--coolto-review-style').trim();
    probe.remove();
    return { bodyPadding: document.body.style.paddingTop, domCount,
      focusId: document.activeElement?.id || '', probeStyleRemoved };
  })()`, true) as Promise<any>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
