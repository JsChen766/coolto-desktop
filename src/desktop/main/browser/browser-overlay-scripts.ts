import type { BrowserFieldWriteRecord } from "../../../browser/types.js";

/**
 * B4: Overlay 注入脚本构造。三段脚本共享同一个 window.__coolto_review
 * 状态对象。inject 挂 mask + toolbar + 每字段徽章；poll 读快照；remove 清理。
 * 单个 ✗ = 清空字段（不还原 valueBefore）；全部接受 = 接受未拒绝的；
 * 全部拒绝 = 还原所有字段。任何字段处理完毕后 auto-unlock。
 */

const STYLE_ID = "__coolto_review_style";
const MASK_ID = "__coolto_review_mask";
const TOOLBAR_ID = "__coolto_review_toolbar";
const BADGE_ATTR = "data-coolto-review-badge";
const STATE_KEY = "__coolto_review";

export function buildOverlayInjectScript(
  records: BrowserFieldWriteRecord[],
): string {
  return `(() => {
  const RECORDS = ${JSON.stringify(records)};
  const STYLE_ID = ${JSON.stringify(STYLE_ID)};
  const MASK_ID = ${JSON.stringify(MASK_ID)};
  const TOOLBAR_ID = ${JSON.stringify(TOOLBAR_ID)};
  const BADGE_ATTR = ${JSON.stringify(BADGE_ATTR)};
  const STATE_KEY = ${JSON.stringify(STATE_KEY)};

  if (document.getElementById(MASK_ID)) return { ok: true, alreadyInjected: true };

  const state = { decisions: {}, globalAction: null, ready: true };
  for (const r of RECORDS) state.decisions[r.fillId] = 'pending';
  window[STATE_KEY] = state;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = \`
    #\${MASK_ID}{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.08);pointer-events:auto}
    #\${TOOLBAR_ID}{position:fixed;top:0;left:0;right:0;z-index:2147483647;
      background:#0f172a;color:#fff;padding:10px 16px;font:14px/1.4 system-ui,-apple-system,sans-serif;
      display:flex;gap:12px;align-items:center;box-shadow:0 2px 12px rgba(0,0,0,.2)}
    #\${TOOLBAR_ID} button{background:#1e293b;color:#fff;border:1px solid #334155;
      border-radius:6px;padding:6px 12px;cursor:pointer;font:inherit}
    #\${TOOLBAR_ID} button.primary{background:#22c55e;border-color:#22c55e}
    #\${TOOLBAR_ID} button.danger{background:#ef4444;border-color:#ef4444}
    [\${BADGE_ATTR}]{position:absolute;z-index:2147483001;display:flex;gap:4px;
      background:#fff;border:1px solid #cbd5e1;border-radius:999px;padding:2px 4px;
      box-shadow:0 2px 8px rgba(15,23,42,.15);pointer-events:auto;font:12px system-ui}
    [\${BADGE_ATTR}] button{width:22px;height:22px;border-radius:999px;border:none;
      cursor:pointer;font-size:14px;line-height:1;padding:0}
    [\${BADGE_ATTR}] .accept{background:#dcfce7;color:#166534}
    [\${BADGE_ATTR}] .reject{background:#fee2e2;color:#991b1b}
    [\${BADGE_ATTR}].done-accept{border-color:#22c55e}
    [\${BADGE_ATTR}].done-reject{border-color:#ef4444}
  \`;
  document.head.appendChild(style);

  const mask = document.createElement('div');
  mask.id = MASK_ID;
  document.body.appendChild(mask);

  const toolbar = document.createElement('div');
  toolbar.id = TOOLBAR_ID;
  toolbar.innerHTML =
    '<span style="flex:1">Coolto 已完成本轮写入，请为每个字段点 ✓ 接受或 ✗ 拒绝；处理完毕后页面自动解锁。</span>' +
    '<button class="primary" data-action="accept-all">全部接受</button>' +
    '<button class="danger" data-action="reject-all">全部拒绝</button>';
  document.body.appendChild(toolbar);

  const restoreValue = (fillId, valueBefore) => {
    const el = document.querySelector('[data-fill-id="' + fillId.replace(/"/g,'') + '"]');
    if (!el) return;
    try {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
      const d = Object.getOwnPropertyDescriptor(proto, 'value');
      if (d && d.set) d.set.call(el, valueBefore); else el.value = valueBefore;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { /* ignore */ }
  };
  const clearValue = (fillId) => restoreValue(fillId, '');

  const markBadge = (badge, decision) => {
    badge.classList.remove('done-accept','done-reject');
    if (decision === 'accepted') badge.classList.add('done-accept');
    if (decision === 'rejected') badge.classList.add('done-reject');
  };

  const positionBadge = (badge, target) => {
    const r = target.getBoundingClientRect();
    badge.style.top = (window.scrollY + r.top - 4) + 'px';
    badge.style.left = (window.scrollX + r.right + 6) + 'px';
    badge.style.position = 'absolute';
  };

  const badges = [];
  for (const rec of RECORDS) {
    const el = document.querySelector('[data-fill-id="' + rec.fillId.replace(/"/g,'') + '"]');
    if (!el) continue;
    const badge = document.createElement('div');
    badge.setAttribute(BADGE_ATTR, rec.fillId);
    badge.innerHTML = '<button class="accept" title="接受">✓</button><button class="reject" title="拒绝">✗</button>';
    document.body.appendChild(badge);
    positionBadge(badge, el);
    badges.push({ badge, el, rec });
  }

  const checkAllDecided = () => {
    const ids = Object.keys(state.decisions);
    if (ids.length === 0) return;
    if (ids.every((id) => state.decisions[id] !== 'pending') && !state.globalAction) {
      state.globalAction = 'auto';
    }
  };

  for (const { badge, rec } of badges) {
    badge.querySelector('.accept').addEventListener('click', () => {
      state.decisions[rec.fillId] = 'accepted';
      markBadge(badge, 'accepted');
      checkAllDecided();
    });
    badge.querySelector('.reject').addEventListener('click', () => {
      clearValue(rec.fillId);
      state.decisions[rec.fillId] = 'rejected';
      markBadge(badge, 'rejected');
      checkAllDecided();
    });
  }

  toolbar.querySelector('[data-action="accept-all"]').addEventListener('click', () => {
    for (const { badge, rec } of badges) {
      if (state.decisions[rec.fillId] !== 'rejected') {
        state.decisions[rec.fillId] = 'accepted';
        markBadge(badge, 'accepted');
      }
    }
    state.globalAction = 'accept_all';
  });
  toolbar.querySelector('[data-action="reject-all"]').addEventListener('click', () => {
    for (const { badge, rec } of badges) {
      restoreValue(rec.fillId, rec.valueBefore || '');
      state.decisions[rec.fillId] = 'rejected';
      markBadge(badge, 'rejected');
    }
    state.globalAction = 'reject_all';
  });

  const relayout = () => { for (const { badge, el } of badges) positionBadge(badge, el); };
  window.addEventListener('scroll', relayout, true);
  window.addEventListener('resize', relayout);

  return { ok: true, injectedCount: badges.length };
})();`;
}

export function buildOverlayPollScript(): string {
  return `(() => {
  const s = window[${JSON.stringify(STATE_KEY)}];
  return s ? { decisions: s.decisions, globalAction: s.globalAction } : null;
})();`;
}

export function buildOverlayRemoveScript(): string {
  return `(() => {
  const STYLE_ID = ${JSON.stringify(STYLE_ID)};
  const MASK_ID = ${JSON.stringify(MASK_ID)};
  const TOOLBAR_ID = ${JSON.stringify(TOOLBAR_ID)};
  const BADGE_ATTR = ${JSON.stringify(BADGE_ATTR)};
  document.getElementById(STYLE_ID)?.remove();
  document.getElementById(MASK_ID)?.remove();
  document.getElementById(TOOLBAR_ID)?.remove();
  document.querySelectorAll('[' + BADGE_ATTR + ']').forEach((el) => el.remove());
  delete window[${JSON.stringify(STATE_KEY)}];
  return { ok: true };
})();`;
}
