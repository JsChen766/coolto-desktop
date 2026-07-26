import type { BrowserFieldWriteRecord } from "../../../browser/types.js";

/**
 * B4: Overlay 注入脚本构造。三段脚本共享同一个 window.__coolto_review
 * 状态对象。inject 挂 mask + toolbar + 每字段徽章；poll 读快照；remove 清理。
 * 单个 ✗ = 文本/下拉清空、勾选框还原为填写前的原始勾选状态；全部接受 = 接受未拒绝的；
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
      box-shadow:0 2px 8px rgba(15,23,42,.15);pointer-events:auto;font:12px system-ui;
      opacity:.35;transition:opacity .12s ease}
    [\${BADGE_ATTR}]:hover{opacity:1}
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

  // 顶部工具栏改为把页面整体下推，避免遮盖页面原有的顶部内容。
  const prevPaddingTop = document.body.style.paddingTop;
  document.body.dataset.cooltoPrevPad = prevPaddingTop;
  const toolbarHeight = Math.ceil(toolbar.getBoundingClientRect().height) || 48;
  document.body.style.paddingTop =
    (parseFloat(prevPaddingTop || '0') + toolbarHeight) + 'px';

  const isCheckable = (rec) => rec.elementType === 'checkbox' || rec.elementType === 'radio';

  const restoreValue = (rec) => {
    const el = document.querySelector('[data-fill-id="' + rec.fillId.replace(/"/g,'') + '"]');
    if (!el) return;
    try {
      if (isCheckable(rec)) {
        const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
        const was = rec.valueBefore === '选中';
        if (d && d.set) d.set.call(el, was); else el.checked = was;
      } else {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
          : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
        const d = Object.getOwnPropertyDescriptor(proto, 'value');
        const v = rec.valueBefore || '';
        if (d && d.set) d.set.call(el, v); else el.value = v;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { /* ignore */ }
  };

  // 单个拒绝：勾选框还原为填写前的原始勾选状态；文本/下拉沿用「清空」。
  const rejectValue = (rec) => {
    const el = document.querySelector('[data-fill-id="' + rec.fillId.replace(/"/g,'') + '"]');
    if (!el) return;
    try {
      if (isCheckable(rec)) {
        restoreValue(rec);
        return;
      }
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
      const d = Object.getOwnPropertyDescriptor(proto, 'value');
      if (d && d.set) d.set.call(el, ''); else el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { /* ignore */ }
  };

  const markBadge = (badge, decision) => {
    badge.classList.remove('done-accept','done-reject');
    if (decision === 'accepted') badge.classList.add('done-accept');
    if (decision === 'rejected') badge.classList.add('done-reject');
  };

  const positionBadge = (badge, target) => {
    const r = target.getBoundingClientRect();
    const bw = badge.offsetWidth || 56;
    const bh = badge.offsetHeight || 28;
    const gap = 6;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const sx = window.scrollX;
    const sy = window.scrollY;
    // 候选顺序：右 → 左 → 上 → 下，取第一个落在视口内的位置。
    // 徽章默认半透明（见 CSS opacity:.35），悬停才变实心，故不再做碰撞检测。
    const candidates = [
      { top: r.top + (r.height - bh) / 2, left: r.right + gap },
      { top: r.top + (r.height - bh) / 2, left: r.left - bw - gap },
      { top: r.top - bh - gap, left: r.left },
      { top: r.bottom + gap, left: r.left },
    ];
    const inViewport = (c) =>
      c.left >= 0 && c.left + bw <= vw && c.top >= 0 && c.top + bh <= vh;
    const pick = candidates.find(inViewport) || candidates[0];
    badge.style.position = 'absolute';
    badge.style.top = (sy + pick.top) + 'px';
    badge.style.left = (sx + Math.max(0, Math.min(pick.left, vw - bw))) + 'px';
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
      rejectValue(rec);
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
      restoreValue(rec);
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
  // 还原注入前的 body padding-top（顶部工具栏腾位）。
  if (document.body.dataset.cooltoPrevPad !== undefined) {
    document.body.style.paddingTop = document.body.dataset.cooltoPrevPad;
    delete document.body.dataset.cooltoPrevPad;
  }
  delete window[${JSON.stringify(STATE_KEY)}];
  return { ok: true };
})();`;
}
