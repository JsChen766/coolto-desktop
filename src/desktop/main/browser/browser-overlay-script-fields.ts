/** Field lookup and value restoration helpers executed in the page. */
export const OVERLAY_FIELD_RUNTIME_SCRIPT = `
  const make = (tag, attrs, text) => {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs || {})) {
      if (name === 'class') element.className = value;
      else element.setAttribute(name, value);
    }
    if (text) element.textContent = text;
    return element;
  };
  const absoluteRect = (element) => {
    let rect = element.getBoundingClientRect();
    let view = element.ownerDocument?.defaultView;
    while (view?.frameElement) {
      const frameRect = view.frameElement.getBoundingClientRect();
      rect = { left: rect.left + frameRect.left, top: rect.top + frameRect.top,
        right: rect.right + frameRect.left, bottom: rect.bottom + frameRect.top,
        width: rect.width, height: rect.height };
      view = view.parent;
    }
    return rect;
  };
  const wrapField = (element) => new Proxy(element, {
    get(target, property, receiver) {
      if (property === 'getBoundingClientRect') return () => absoluteRect(target);
      const value = Reflect.get(target, property, target);
      if (property === '__cooltoReviewTarget') return target;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const findIn = (root, fillId) => {
    const found = Array.from(root.querySelectorAll('[data-fill-id]'))
      .find((element) => element.getAttribute('data-fill-id') === fillId);
    if (found) return wrapField(found);
    for (const frame of root.querySelectorAll('iframe,frame')) {
      try {
        if (frame.contentDocument) {
          const nested = findIn(frame.contentDocument, fillId);
          if (nested) return nested;
        }
      } catch {}
    }
    return null;
  };
  const findField = (fillId) => findIn(document, fillId);
  const isCheckable = (record) => record.elementType === 'checkbox' || record.elementType === 'radio';
  const dispatchValueChange = (element) => {
    const view = element.ownerDocument?.defaultView || window;
    element.dispatchEvent(new view.Event('input', { bubbles: true }));
    element.dispatchEvent(new view.Event('change', { bubbles: true }));
  };
  const writeValue = (record, value) => {
    const element = findField(record.fillId);
    if (!element) return;
    const target = element.__cooltoReviewTarget || element;
    try {
      const view = target.ownerDocument?.defaultView || window;
      if (isCheckable(record)) {
        const descriptor = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'checked');
        const checked = value === '选中';
        if (descriptor && descriptor.set) descriptor.set.call(target, checked);
        else target.checked = checked;
      } else if (record.elementType === 'contenteditable' || target.isContentEditable) {
        target.textContent = value;
      } else {
        const isSelect = target.tagName === 'SELECT' ||
          target instanceof view.HTMLSelectElement;
        const prototype = target.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype
          : isSelect ? view.HTMLSelectElement.prototype
          : view.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        let nextValue = value;
        if (isSelect && value) {
          const option = Array.from(target.options).find((item) =>
            item.value === value || (item.textContent || '').trim() === value);
          nextValue = option ? option.value : value;
        }
        if (descriptor && descriptor.set) descriptor.set.call(target, nextValue);
        else target.value = nextValue;
      }
      dispatchValueChange(target);
    } catch { /* the page may have replaced the controlled field */ }
  };
  const restoreValue = (record) => writeValue(record, record.valueBefore || '');
  const rejectValue = (record) => restoreValue(record);
`;
