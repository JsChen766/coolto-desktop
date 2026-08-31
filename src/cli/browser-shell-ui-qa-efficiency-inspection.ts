import type { BrowserWindow } from "electron";

export interface EfficiencyShellInspection {
  activeTabTooltip: string | null;
  activeTabVisible: boolean;
  addressFocusedAndSelected: boolean;
  findFocused: boolean;
  findVisible: boolean;
  hasOverflowControls: boolean;
  noDocumentOverflow: boolean;
  rovingTabStops: number;
  tabCount: number;
  tabFocused: boolean;
  zoomBadge: string | null;
}

export function inspectEfficiencyShell(
  browser: BrowserWindow,
): Promise<EfficiencyShellInspection> {
  return browser.webContents.executeJavaScript(`(() => {
    const address = document.querySelector('.address');
    const active = document.querySelector('[role="tab"][aria-selected="true"]');
    const viewport = document.querySelector('.tab-viewport');
    const activeRect = active?.getBoundingClientRect();
    const viewportRect = viewport?.getBoundingClientRect();
    return {
      activeTabTooltip: active?.getAttribute('title') ?? null,
      activeTabVisible: Boolean(activeRect && viewportRect &&
        activeRect.left >= viewportRect.left - 1 && activeRect.right <= viewportRect.right + 1),
      addressFocusedAndSelected: address === document.activeElement &&
        address instanceof HTMLInputElement && address.selectionStart === 0 &&
        address.selectionEnd === address.value.length,
      findFocused: document.activeElement?.classList.contains('find-input') === true,
      findVisible: Boolean(document.querySelector('.find-bar')),
      hasOverflowControls: document.querySelectorAll('.tab-scroll').length === 2,
      noDocumentOverflow: document.documentElement.scrollWidth ===
        document.documentElement.clientWidth,
      rovingTabStops: document.querySelectorAll('[role="tab"][tabindex="0"]').length,
      tabCount: document.querySelectorAll('[role="tab"]').length,
      tabFocused: document.activeElement?.getAttribute('role') === 'tab',
      zoomBadge: document.querySelector('.zoom-badge')?.textContent?.trim() ?? null,
    };
  })()`, true) as Promise<EfficiencyShellInspection>;
}

export async function focusActiveShellTab(browser: BrowserWindow): Promise<void> {
  await browser.webContents.executeJavaScript(
    "document.querySelector('[role=tab][aria-selected=true]')?.focus(); true", true,
  );
  browser.webContents.focus();
}
