/**
 * B3: 写原语注入脚本（fill/select/setChecked/click/scroll）。
 * 每段脚本严格自包含，参数经 JSON.stringify 转义避免注入。返回 { ok, reason? }。
 * 处理 React/Vue 受控组件：用原生 prototype setter 绕过 value 劫持后派发 input/change。
 */

function q(value: string): string {
  return JSON.stringify(value);
}

const HELPERS = `
  const findEl = (fillId) => document.querySelector('[data-fill-id="' + fillId.replace(/"/g, '') + '"]');
  const nativeSetter = (proto, prop) => {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    return d && d.set ? d.set : null;
  };
  const setInputValue = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const set = nativeSetter(proto, 'value');
    if (set) set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
`;

export function buildFillScript(fillId: string, value: string): string {
  return `(() => {
  ${HELPERS}
  const el = findEl(${q(fillId)});
  if (!el) return { ok: false, reason: 'element_not_found' };
  const readLabel = () => {
    if (el.id) {
      const l = document.querySelector('label[for="' + el.id + '"]');
      if (l && l.innerText) return l.innerText.trim();
    }
    const wrap = el.closest && el.closest('label');
    if (wrap && wrap.innerText) return wrap.innerText.trim();
    return el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
  };
  if (el.isContentEditable) {
    if (el.getAttribute('aria-disabled') === 'true')
      return { ok: false, reason: 'element_disabled' };
    try {
      const valueBefore = typeof el.innerText === 'string' ? el.innerText : '';
      const label = readLabel();
      el.focus();
      // 全选原内容后用 insertText 覆盖：保留纯文本、触发框架监听（beforeinput/input）。
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, ${q(value)});
      } catch (e) { inserted = false; }
      if (!inserted || el.innerText === valueBefore) {
        // 降级：直接写 textContent 并派发 input 事件。
        el.textContent = ${q(value)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.blur();
      return {
        ok: true,
        valueBefore: valueBefore.slice(0, 500),
        valueAfter: ${q(value)}.slice(0, 500),
        label: (label || '').slice(0, 200),
        elementType: 'contenteditable',
      };
    } catch (e) {
      return { ok: false, reason: (e && e.message) || 'fill_failed' };
    }
  }
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA')
    return { ok: false, reason: 'not_text_input' };
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (type === 'password')
    return { ok: false, reason: 'password_forbidden' };
  if (type === 'file')
    return { ok: false, reason: 'file_input_use_upload_tool' };
  if (el.disabled)
    return { ok: false, reason: 'element_disabled' };
  try {
    const valueBefore = typeof el.value === 'string' ? el.value : '';
    const label = readLabel();
    el.focus();
    setInputValue(el, ${q(value)});
    el.blur();
    return {
      ok: true,
      valueBefore: valueBefore.slice(0, 500),
      valueAfter: ${q(value)}.slice(0, 500),
      label: (label || '').slice(0, 200),
      elementType: tag === 'TEXTAREA' ? 'textarea' : 'input',
    };
  } catch (e) {
    return { ok: false, reason: (e && e.message) || 'fill_failed' };
  }
})();`;
}

export function buildSelectScript(fillId: string, value: string): string {
  return `(() => {
  ${HELPERS}
  const el = findEl(${q(fillId)});
  if (!el) return { ok: false, reason: 'element_not_found' };
  if (el.tagName !== 'SELECT') return { ok: false, reason: 'not_select' };
  if (el.disabled) return { ok: false, reason: 'element_disabled' };
  const options = Array.from(el.options);
  const target = options.find((o) => o.value === ${q(value)})
    || options.find((o) => (o.textContent || '').trim() === ${q(value)});
  if (!target) return { ok: false, reason: 'option_not_found' };
  const valueBefore = typeof el.value === 'string' ? el.value : '';
  const labelBefore = (function () {
    const opt = options.find((o) => o.value === valueBefore);
    return opt ? (opt.textContent || valueBefore) : valueBefore;
  })();
  const set = nativeSetter(HTMLSelectElement.prototype, 'value');
  if (set) set.call(el, target.value); else el.value = target.value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  const label = (function () {
    if (el.id) {
      const l = document.querySelector('label[for="' + el.id + '"]');
      if (l && l.innerText) return l.innerText.trim();
    }
    return el.getAttribute('aria-label') || '';
  })();
  return {
    ok: true,
    valueBefore: (labelBefore || '').slice(0, 500),
    valueAfter: (target.textContent || target.value || '').slice(0, 500),
    label: (label || '').slice(0, 200),
    elementType: 'select',
  };
})();`;
}

export function buildSetCheckedScript(fillId: string, checked: boolean): string {
  return `(() => {
  ${HELPERS}
  const el = findEl(${q(fillId)});
  if (!el) return { ok: false, reason: 'element_not_found' };
  if (el.tagName !== 'INPUT') return { ok: false, reason: 'not_input' };
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (type !== 'checkbox' && type !== 'radio')
    return { ok: false, reason: 'not_checkable' };
  if (el.disabled) return { ok: false, reason: 'element_disabled' };
  const wasChecked = !!el.checked;
  const set = nativeSetter(HTMLInputElement.prototype, 'checked');
  if (set) set.call(el, ${checked ? "true" : "false"});
  else el.checked = ${checked ? "true" : "false"};
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  const label = (function () {
    if (el.id) {
      const l = document.querySelector('label[for="' + el.id + '"]');
      if (l && l.innerText) return l.innerText.trim();
    }
    const wrap = el.closest && el.closest('label');
    if (wrap && wrap.innerText) return wrap.innerText.trim();
    return el.getAttribute('aria-label') || '';
  })();
  return {
    ok: true,
    valueBefore: wasChecked ? '选中' : '未选中',
    valueAfter: ${checked ? "'选中'" : "'未选中'"},
    label: (label || '').slice(0, 200),
    elementType: type,
  };
})();`;
}

export function buildScrollScript(fillId: string): string {
  return `(() => {
  ${HELPERS}
  const el = findEl(${q(fillId)});
  if (!el) return { ok: false, reason: 'element_not_found' };
  try {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e && e.message) || 'scroll_failed' };
  }
})();`;
}

/**
 * click 分两阶段：
 *  - mode === 'read'  返回目标元素属性给主进程判定
 *  - mode === 'click' 执行点击
 * 拆开保证「是否为提交按钮」的策略在主进程（可测），不埋在注入脚本里。
 */
export function buildClickScript(fillId: string, mode: "read" | "click"): string {
  if (mode === "read") {
    return `(() => {
    ${HELPERS}
    const el = findEl(${q(fillId)});
    if (!el) return null;
    const text = (el.innerText || el.textContent || '').trim().slice(0, 200);
    const value = ('value' in el ? String(el.value || '') : '').slice(0, 200);
    return {
      tagName: el.tagName,
      type: el.getAttribute('type'),
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label') || '',
      text,
      value,
      name: el.getAttribute('name') || '',
      id: el.id || '',
      testId: el.getAttribute('data-testid') || '',
      inForm: !!(el.closest && el.closest('form')),
    };
  })();`;
  }
  return `(() => {
  ${HELPERS}
  const el = findEl(${q(fillId)});
  if (!el) return { ok: false, reason: 'element_not_found' };
  if (el.disabled) return { ok: false, reason: 'element_disabled' };
  try {
    el.click();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e && e.message) || 'click_failed' };
  }
})();`;
}
