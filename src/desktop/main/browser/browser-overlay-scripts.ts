import type { BrowserFieldWriteRecord } from "../../../browser/types.js";
import type { BrowserLocale } from "../../shared/types.js";
import { OVERLAY_FIELD_RUNTIME_SCRIPT } from "./browser-overlay-script-fields.js";
import { OVERLAY_STYLE_READINESS_SCRIPT } from "./browser-overlay-script-readiness.js";
import { OVERLAY_UI_RUNTIME_SCRIPT } from "./browser-overlay-script-ui.js";
import { OVERLAY_VIEWPORT_RUNTIME_SCRIPT } from "./browser-overlay-viewport.js";
import {
  buildOverlayStyleText,
  type BrowserOverlayTheme,
} from "./browser-overlay-styles.js";

/**
 * B4 review chrome. Field decisions remain in the page only until the main
 * process polls them; cleanup restores every host-page property we change.
 */
const MASK_ID = "__coolto_review_mask";
const TOOLBAR_ID = "__coolto_review_toolbar";
const BADGE_ATTR = "data-coolto-review-badge";
const STATE_KEY = "__coolto_review";

const COPY = {
  "zh-CN": {
    region: "填写审核", title: "Coolto 已填写以下字段，请逐项审核。",
    progress: "已处理 {done}/{total}", acceptAll: "✓ 全部接受", rejectAll: "× 全部拒绝",
    field: "审核字段：", accept: "✓ 接受", reject: "× 拒绝",
    pending: "待审核", accepted: "已接受", rejected: "已拒绝",
  },
  "en-US": {
    region: "Fill review", title: "Coolto filled these fields. Review each change.",
    progress: "{done}/{total} reviewed", acceptAll: "✓ Accept all", rejectAll: "× Reject all",
    field: "Review field: ", accept: "✓ Accept", reject: "× Reject",
    pending: "Pending", accepted: "Accepted", rejected: "Rejected",
  },
} as const;

export function buildOverlayCss(theme: BrowserOverlayTheme): string {
  return buildOverlayStyleText({
    maskId: MASK_ID, toolbarId: TOOLBAR_ID, badgeAttr: BADGE_ATTR, theme,
  });
}

export function buildOverlayInjectScript(
  records: BrowserFieldWriteRecord[],
  locale: BrowserLocale,
): string {
  return `(async () => {
  const RECORDS = ${JSON.stringify(records)};
  const COPY = ${JSON.stringify(COPY[locale])};
  const MASK_ID = ${JSON.stringify(MASK_ID)};
  const TOOLBAR_ID = ${JSON.stringify(TOOLBAR_ID)};
  const BADGE_ATTR = ${JSON.stringify(BADGE_ATTR)};
  const STATE_KEY = ${JSON.stringify(STATE_KEY)};
  if (!document.head || !document.body) return { ok: false, reason: 'document_unavailable' };
  if (document.getElementById(MASK_ID)) return { ok: true, alreadyInjected: true };

  const previousFocus = document.activeElement;
  const previousBodyPaddingTop = document.body.style.paddingTop;
  const baseBodyPaddingTop = getComputedStyle(document.body).paddingTop || '0px';
  const state = {
    decisions: Object.create(null), knownIds: RECORDS.map((record) => record.fillId),
    globalAction: null, ready: true, cleanup: null, copy: COPY,
    mask: null, toolbar: null, title: null, progress: null,
    acceptAll: null, rejectAll: null, entries: [],
  };
  for (const record of RECORDS) state.decisions[record.fillId] = 'pending';
  window[STATE_KEY] = state;
${OVERLAY_FIELD_RUNTIME_SCRIPT}
${OVERLAY_STYLE_READINESS_SCRIPT}
${OVERLAY_UI_RUNTIME_SCRIPT}
})();`;
}

export function buildOverlayPollScript(): string {
  return `(() => {
${OVERLAY_VIEWPORT_RUNTIME_SCRIPT}
  const state = window[${JSON.stringify(STATE_KEY)}];
  const mask = state && state.mask;
  const toolbar = state && state.toolbar;
  const entries = state && Array.isArray(state.entries) ? state.entries : [];
  if (!state || !mask || !toolbar || !mask.isConnected || !toolbar.isConnected
    || document.getElementById(${JSON.stringify(MASK_ID)}) !== mask
    || document.getElementById(${JSON.stringify(TOOLBAR_ID)}) !== toolbar) return null;
  const maskStyle = getComputedStyle(mask);
  const toolbarStyle = getComputedStyle(toolbar);
  const maskRect = mask.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? document.documentElement.clientWidth;
  const viewportHeight = viewport?.height ?? document.documentElement.clientHeight;
  const viewportEdges = {
    left: viewportLeft, top: viewportTop,
    right: viewportLeft + viewportWidth, bottom: viewportTop + viewportHeight,
  };
  if (maskStyle.position !== 'fixed' || toolbarStyle.position !== 'fixed'
    || maskStyle.pointerEvents !== 'auto' || toolbarStyle.pointerEvents !== 'auto'
    || maskStyle.zIndex !== '2147483000' || toolbarStyle.zIndex !== '2147483647'
    || maskStyle.display === 'none' || toolbarStyle.display !== 'flex'
    || maskStyle.visibility !== 'visible' || toolbarStyle.visibility !== 'visible'
    || maskStyle.opacity !== '1' || toolbarStyle.opacity !== '1'
    || !browserOverlayRectCoversViewport(maskRect, viewportEdges, devicePixelRatio)
    || !browserOverlayTopBarCoversViewport(toolbarRect, viewportEdges, devicePixelRatio)
    || maskStyle.getPropertyValue('--coolto-review-style').trim() !== 'mask'
    || toolbarStyle.getPropertyValue('--coolto-review-style').trim() !== 'toolbar') return null;
  const interactive = (button, text, className, minWidth) => {
    if (!button || !button.isConnected || button.textContent !== text
      || button.children.length !== 0 || button.getAttribute('aria-label') !== text
      || button.className !== className) return false;
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return style.display !== 'none' && style.visibility === 'visible'
      && style.pointerEvents === 'auto' && style.opacity === '1'
      && rect.width >= minWidth && rect.height >= 28;
  };
  const copy = state.copy;
  if (!copy || !state.title || state.title.textContent !== copy.title
    || !interactive(state.acceptAll, copy.acceptAll, 'primary', 64)
    || !interactive(state.rejectAll, copy.rejectAll, 'danger', 64)) return null;
  const knownIds = Array.isArray(state.knownIds) ? state.knownIds : [];
  const values = knownIds.map((id) => state.decisions[id]);
  const expectedProgress = copy.progress
    .replace('{done}', String(values.filter((value) => value !== 'pending').length))
    .replace('{total}', String(values.length));
  if (!state.progress || state.progress.textContent !== expectedProgress) return null;
  for (const entry of entries) {
    if (!entry.badge || !entry.badge.isConnected) return null;
    const fieldDecision = state.decisions[entry.record.fillId] || 'pending';
    const rect = entry.element && entry.element.isConnected
      ? entry.element.getBoundingClientRect() : null;
    const offscreen = !rect || rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0
      || rect.right <= 0 || rect.top >= document.documentElement.clientHeight
      || rect.left >= document.documentElement.clientWidth;
    if (entry.badge.hidden !== offscreen
      || entry.badge.getAttribute('aria-label') !== copy.field
        + (entry.record.label || String(entry.index + 1))
      || entry.accept.textContent !== copy.accept || entry.reject.textContent !== copy.reject
      || entry.accept.getAttribute('aria-pressed') !== String(fieldDecision === 'accepted')
      || entry.reject.getAttribute('aria-pressed') !== String(fieldDecision === 'rejected')
      || entry.decision.textContent !== (fieldDecision === 'accepted'
        ? copy.accepted : fieldDecision === 'rejected' ? copy.rejected : copy.pending)) return null;
    if (!offscreen) {
      const badgeStyle = getComputedStyle(entry.badge);
      if (badgeStyle.position !== 'absolute' || badgeStyle.pointerEvents !== 'auto'
        || badgeStyle.zIndex !== '2147483001'
        || !interactive(entry.accept, copy.accept, 'accept', 44)
        || !interactive(entry.reject, copy.reject, 'reject', 44)) return null;
    }
  }
  const decisions = Object.create(null);
  for (const id of knownIds) {
    if (Object.prototype.hasOwnProperty.call(state.decisions, id)) {
      decisions[id] = state.decisions[id];
    }
  }
  return { decisions, globalAction: state.globalAction };
})();`;
}

export function buildOverlayRemoveScript(): string {
  return `(() => {
  const state = window[${JSON.stringify(STATE_KEY)}];
  try { if (state && typeof state.cleanup === 'function') state.cleanup(); } catch {}
  document.getElementById(${JSON.stringify(MASK_ID)})?.remove();
  document.getElementById(${JSON.stringify(TOOLBAR_ID)})?.remove();
  document.querySelectorAll('[${BADGE_ATTR}]').forEach((element) => element.remove());
  if (document.body.dataset.cooltoPrevPad !== undefined) {
    document.body.style.paddingTop = document.body.dataset.cooltoPrevPad;
    delete document.body.dataset.cooltoPrevPad;
  }
  delete window[${JSON.stringify(STATE_KEY)}];
  return { ok: true };
})();`;
}
