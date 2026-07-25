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
      const l = document.querySelector('label[for="' + el.id + '"]');
      if (l && l.innerText) return l.innerText.trim();
    }
    const wrap = el.closest && el.closest('label');
    if (wrap && wrap.innerText) return wrap.innerText.trim();
    return el.getAttribute('aria-label') || el.getAttribute('title') || '';
  };
  const isVisible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = window.getComputedStyle(el);
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
    if (el.getAttribute && el.getAttribute('aria-checked'))
      return el.getAttribute('aria-checked');
    return undefined;
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

  const selector = 'input, textarea, select, button, a[href]';
  const nodes = document.querySelectorAll(selector);
  const out = [];
  for (const el of nodes) {
    if (out.length >= ${maxElements}) break;
    const type = inputTypeOf(el);
    if (type === 'hidden') continue;
    if (!isVisible(el)) continue;
    const fillId = ensureId(el);
    const label = (labelFor(el) || '').slice(0, 200);
    const placeholder = (el.getAttribute('placeholder') || '').slice(0, 200);
    const required = el.hasAttribute('required')
      || el.getAttribute('aria-required') === 'true';
    const summary = {
      fillId,
      elementType: kindOf(el),
      label,
      placeholder,
      required,
    };
    if (type) summary.inputType = type;
    const currentValue = readValue(el);
    if (currentValue !== undefined && currentValue !== '') {
      summary.currentValue = currentValue;
    }
    out.push(summary);
  }
  return out;
})();`;
}
