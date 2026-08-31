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
  const findField = (fillId) => Array.from(document.querySelectorAll('[data-fill-id]'))
    .find((element) => element.getAttribute('data-fill-id') === fillId);
  const isCheckable = (record) => record.elementType === 'checkbox' || record.elementType === 'radio';
  const dispatchValueChange = (element) => {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const writeValue = (record, value) => {
    const element = findField(record.fillId);
    if (!element) return;
    try {
      if (isCheckable(record)) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
        const checked = value === '选中';
        if (descriptor && descriptor.set) descriptor.set.call(element, checked);
        else element.checked = checked;
      } else if (record.elementType === 'contenteditable' || element.isContentEditable) {
        element.textContent = value;
      } else {
        const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
          : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        let nextValue = value;
        if (element instanceof HTMLSelectElement && value) {
          const option = Array.from(element.options).find((item) =>
            item.value === value || (item.textContent || '').trim() === value);
          nextValue = option ? option.value : value;
        }
        if (descriptor && descriptor.set) descriptor.set.call(element, nextValue);
        else element.value = nextValue;
      }
      dispatchValueChange(element);
    } catch { /* the page may have replaced the controlled field */ }
  };
  const restoreValue = (record) => writeValue(record, record.valueBefore || '');
  const rejectValue = (record) => isCheckable(record) ? restoreValue(record) : writeValue(record, '');
`;
