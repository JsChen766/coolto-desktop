/**
 * B3: tagElements 注入脚本构造。
 * 给可操作元素（input/textarea/select/button/a）注入 data-fill-id，
 * 返回带稳定 id 的元素摘要。跳过隐藏字段与不可见元素。
 * 已有 data-fill-id 的元素保留原 id，保证跨调用稳定。
 */
export function buildTagElementsScript(maxElements: number): string {
  return `(() => {
  const labelFor = (el) => {
    if (el.id) {
      const l = el.ownerDocument.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l && l.innerText) return l.innerText.trim();
    }
    const wrap = el.closest && el.closest('label');
    if (wrap && wrap.innerText) return wrap.innerText.trim();
    return el.getAttribute('aria-label') || el.getAttribute('title') || '';
  };
  const isVisible = (el) => {
    const view = el.ownerDocument.defaultView;
    if (!view || !(el instanceof view.HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    return true;
  };
  const kindOf = (el) => {
    const tag = el.tagName;
    if (tag === 'INPUT') return 'input';
    if (tag === 'TEXTAREA') return 'textarea';
    if (tag === 'SELECT') return 'select';
    if (tag === 'BUTTON') return 'button';
    if (tag === 'A') return 'a';
    if (el.isContentEditable) return 'contenteditable';
    return 'other';
  };
  const inputTypeOf = (el) => {
    if (el.tagName === 'INPUT') return (el.getAttribute('type') || 'text').toLowerCase();
    if (el.tagName === 'TEXTAREA') return 'textarea';
    if (el.tagName === 'SELECT') return 'select';
    return undefined;
  };
  const readValue = (el) => {
    if ('value' in el) {
      const v = el.value;
      if (typeof v === 'string') return v.slice(0, 500);
    }
    if (el.isContentEditable) {
      const t = el.innerText;
      if (typeof t === 'string') return t.slice(0, 500);
    }
    if (el.getAttribute && el.getAttribute('aria-checked'))
      return el.getAttribute('aria-checked');
    return undefined;
  };
  // 只收顶层 contenteditable：自身可编辑但最近的可编辑祖先就是自己，
  // 避免 Gmail 等嵌套 contenteditable 产生一堆重复 fillId。
  const isTopEditable = (el) => {
    if (!el.isContentEditable) return false;
    const parent = el.parentElement && el.parentElement.closest
      ? el.parentElement.closest('[contenteditable=""],[contenteditable="true"]')
      : null;
    return !parent;
  };

  let counter = 0;
  const seed = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const ensureId = (el) => {
    const existing = el.getAttribute('data-fill-id');
    if (existing) return existing;
    counter += 1;
    const id = 'fid-' + seed + '-' + counter;
    el.setAttribute('data-fill-id', id);
    return id;
  };

  const selector =
    'input, textarea, select, button, a[href], [contenteditable=""], [contenteditable="true"], ' +
    '[draggable="true"], [data-drop-target]';
  const out = [];
  const visit = (root) => {
    const nodes = root.querySelectorAll(selector);
    for (const el of nodes) {
      if (out.length >= ${maxElements}) return;
      const type = inputTypeOf(el);
      if (type === 'hidden' || !isVisible(el)) continue;
      if (el.isContentEditable && !isTopEditable(el)) continue;
      const summary = {
        fillId: ensureId(el), elementType: kindOf(el),
        label: (labelFor(el) || '').slice(0, 200),
        placeholder: (el.getAttribute('placeholder') || '').slice(0, 200),
        required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
      };
      if (type) summary.inputType = type;
      const currentValue = readValue(el);
      if (currentValue !== undefined && currentValue !== '') summary.currentValue = currentValue;
      out.push(summary);
    }
    for (const el of root.querySelectorAll('*')) {
      if (out.length >= ${maxElements}) return;
      if (el.shadowRoot) visit(el.shadowRoot);
      if (el.tagName === 'IFRAME') {
        try { if (el.contentDocument) visit(el.contentDocument); }
        catch (e) { /* cross-origin frame intentionally unavailable */ }
      }
    }
  };
  visit(document);
  return out;
})();`;
}
