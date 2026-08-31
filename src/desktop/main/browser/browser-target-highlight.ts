import type { WebContents } from "electron";

import { ELEMENT_HELPERS_SCRIPT } from "./browser-element-scripts.js";

const HIGHLIGHT_LEAD_MS = 340;
const HIGHLIGHT_MAX_MS = 450;
const STATE_KEY = "__coolto_agent_target_highlight";
let nextHighlight = 0;

type Wait = (durationMs: number) => Promise<void>;

/**
 * Adds a short, page-local target cue before a semantic fill-id action.
 * The cue is best effort only: it never authorizes, locates, or replaces the action.
 */
export async function runWithBrowserTargetHighlight<T>(
  contents: WebContents,
  fillId: string,
  action: () => Promise<T>,
  wait: Wait = waitFor,
  promoteClickTarget = false,
): Promise<T> {
  const token = `${Date.now().toString(36)}-${++nextHighlight}`;
  let highlighted = false;
  try {
    highlighted = await contents.executeJavaScript(
      buildTargetHighlightScript(fillId, token, promoteClickTarget), true,
    ) === true;
  } catch {
    // Visual feedback is not an execution or authorization gate.
  }
  if (highlighted) await wait(HIGHLIGHT_LEAD_MS);
  try {
    return await action();
  } finally {
    if (highlighted) {
      try {
        await contents.executeJavaScript(buildTargetHighlightClearScript(token), true);
      } catch {
        // Navigation may destroy the page before cleanup; the document is already gone.
      }
    }
  }
}

export function runWithBrowserClickTargetHighlight<T>(
  contents: WebContents,
  fillId: string,
  action: () => Promise<T>,
): Promise<T> {
  return runWithBrowserTargetHighlight(contents, fillId, action, waitFor, true);
}

export function buildTargetHighlightScript(
  fillId: string,
  token: string,
  promoteClickTarget = false,
): string {
  return `(() => {
  ${ELEMENT_HELPERS_SCRIPT}
  const tagged = findEl(${JSON.stringify(fillId)});
  if (!tagged || !tagged.isConnected) return false;
  const ownRole = String(tagged.getAttribute('role') || '').toLowerCase();
  const ownInteractive = ['button','link','option','row','listitem','treeitem','tab']
    .includes(ownRole) || ['BUTTON','A','INPUT','SELECT','TEXTAREA'].includes(tagged.tagName);
  const target = ${promoteClickTarget ? "ownInteractive ? tagged : (tagged.closest && tagged.closest('[role=\"option\"],[role=\"row\"],[role=\"listitem\"],[role=\"treeitem\"],[role=\"tab\"]')) || tagged" : "tagged"};
  const owner = target.ownerDocument;
  const root = owner.body || owner.documentElement;
  const view = owner.defaultView;
  if (!root || !view) return false;
  const inViewport = (rect) => rect.width > 0 && rect.height > 0 &&
    rect.bottom > 0 && rect.right > 0 &&
    rect.top < view.innerHeight && rect.left < view.innerWidth;
  if (!inViewport(target.getBoundingClientRect())) return false;
  const stateKey = ${JSON.stringify(STATE_KEY)};
  const prior = window[stateKey];
  if (prior && typeof prior.clear === 'function') prior.clear();
  const marker = owner.createElement('div');
  marker.setAttribute('data-coolto-agent-target', '');
  marker.setAttribute('aria-hidden', 'true');
  Object.assign(marker.style, {
    position: 'fixed', pointerEvents: 'none', boxSizing: 'border-box',
    border: '2px solid #356fca', boxShadow: '0 0 0 2px rgba(255,255,255,.9)',
    borderRadius: '6px', zIndex: '2147483646'
  });
  root.appendChild(marker);
  const rendered = view.getComputedStyle(marker);
  if (rendered.position !== 'fixed' || rendered.pointerEvents !== 'none') {
    marker.remove();
    return false;
  }
  let frame = 0;
  let timer = 0;
  let observer;
  const clear = () => {
    if (frame) view.cancelAnimationFrame(frame);
    if (timer) view.clearTimeout(timer);
    if (observer) observer.disconnect();
    marker.remove();
    if (window[stateKey] && window[stateKey].token === ${JSON.stringify(token)}) {
      delete window[stateKey];
    }
  };
  const place = () => {
    if (!target.isConnected || !marker.isConnected) { clear(); return; }
    const rect = target.getBoundingClientRect();
    if (!inViewport(rect)) { clear(); return; }
    marker.style.left = (rect.left - 3) + 'px';
    marker.style.top = (rect.top - 3) + 'px';
    marker.style.width = (rect.width + 6) + 'px';
    marker.style.height = (rect.height + 6) + 'px';
    frame = view.requestAnimationFrame(place);
  };
  observer = new view.MutationObserver(() => {
    if (!target.isConnected) clear();
  });
  observer.observe(owner, { childList: true, subtree: true });
  window[stateKey] = { token: ${JSON.stringify(token)}, clear };
  place();
  timer = view.setTimeout(clear, ${HIGHLIGHT_MAX_MS});
  return true;
})()`;
}

export function buildTargetHighlightClearScript(token: string): string {
  return `(() => {
  const state = window[${JSON.stringify(STATE_KEY)}];
  if (state && state.token === ${JSON.stringify(token)} &&
      typeof state.clear === 'function') state.clear();
  return true;
})()`;
}

function waitFor(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
