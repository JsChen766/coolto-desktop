/** Shared injected helpers for fill-id actions across same-origin frames and open shadows. */
export const ELEMENT_HELPERS_SCRIPT = `
  const roots = (root) => {
    const nested = [];
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) nested.push(el.shadowRoot);
      if (el.tagName === 'IFRAME') {
        try { if (el.contentDocument) nested.push(el.contentDocument); }
        catch (e) { /* cross-origin frame intentionally unavailable */ }
      }
    }
    return nested;
  };
  const findEl = (fillId) => {
    const queue = [document];
    const expected = String(fillId);
    while (queue.length) {
      const root = queue.shift();
      const found = Array.from(root.querySelectorAll('[data-fill-id]'))
        .find((element) => element.getAttribute('data-fill-id') === expected);
      if (found) return found;
      queue.push(...roots(root));
    }
    return null;
  };
  const nativeSetter = (proto, prop) => {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    return d && d.set ? d.set : null;
  };
  const viewOf = (el) => el.ownerDocument.defaultView || window;
  const setInputValue = (el, value) => {
    const view = viewOf(el);
    const proto = el.tagName === 'TEXTAREA'
      ? view.HTMLTextAreaElement.prototype
      : view.HTMLInputElement.prototype;
    const set = nativeSetter(proto, 'value');
    if (set) set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
`;
