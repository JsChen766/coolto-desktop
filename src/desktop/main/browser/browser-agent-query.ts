import type { WebContents } from "electron";

import type {
  BrowserElementQuery,
  BrowserElementQueryResult,
} from "../../../browser/agent-control-types.js";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

export async function queryBrowserElements(
  contents: WebContents,
  query: BrowserElementQuery,
): Promise<BrowserElementQueryResult> {
  const selector = query.selector?.trim() ?? "";
  const text = query.text?.trim() ?? "";
  const role = query.role?.trim().toLowerCase() ?? "";
  if (!selector && !text && !role) {
    throw new Error("元素查询至少需要 selector、text 或 role 之一");
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
  const raw = await contents.executeJavaScript(
    buildElementQueryScript({ selector, text, role, limit }),
    true,
  ) as BrowserElementQueryResult & { error?: string };
  if (raw.error) throw new Error(raw.error);
  return {
    elements: Array.isArray(raw.elements) ? raw.elements.slice(0, limit) : [],
    truncated: Boolean(raw.truncated),
  };
}

function buildElementQueryScript(input: {
  selector: string;
  text: string;
  role: string;
  limit: number;
}): string {
  return `(() => {
  const wanted = ${JSON.stringify(input)};
  const out = [];
  let matched = 0;
  const clean = (v, n = 300) => String(v || '').replace(/\\s+/g, ' ').trim().slice(0, n);
  const signature = (el) => clean(el.tagName.toLowerCase() +
    (el.id ? '#' + el.id : '') +
    (el.getAttribute('name') ? '[name="' + el.getAttribute('name') + '"]' : ''), 160);
  const label = (el) => {
    if (el.id) {
      const found = el.ownerDocument.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (found) return clean(found.innerText || found.textContent, 200);
    }
    const wrap = el.closest && el.closest('label');
    return clean((wrap && (wrap.innerText || wrap.textContent)) ||
      el.getAttribute('aria-label') || el.getAttribute('placeholder'), 200);
  };
  const visible = (el) => {
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const visit = (root, frames, shadows) => {
    let nodes;
    try { nodes = root.querySelectorAll('*'); } catch (e) { return; }
    for (const el of nodes) {
      if (out.length >= wanted.limit) { matched += 1; return; }
      const nodeText = clean(el.innerText || el.textContent);
      const explicitRole = clean(el.getAttribute('role') || '').toLowerCase();
      const implicitRole = (() => {
        const tag = el.tagName;
        if (tag === 'BUTTON') return 'button';
        if (tag === 'A' && el.hasAttribute('href')) return 'link';
        if (tag === 'SELECT') return 'combobox';
        if (tag === 'TEXTAREA') return 'textbox';
        if (tag === 'INPUT') {
          const type = (el.getAttribute('type') || 'text').toLowerCase();
          if (type === 'checkbox') return 'checkbox';
          if (type === 'radio') return 'radio';
          if (['button', 'submit', 'reset'].includes(type)) return 'button';
          return 'textbox';
        }
        return '';
      })();
      const nodeRole = explicitRole || implicitRole;
      let selectorMatch = true;
      if (wanted.selector) {
        try { selectorMatch = el.matches(wanted.selector); }
        catch (e) { return { error: '无效 CSS selector' }; }
      }
      const textMatch = !wanted.text || nodeText.toLowerCase().includes(wanted.text.toLowerCase());
      const roleMatch = !wanted.role || nodeRole === wanted.role;
      if (selectorMatch && textMatch && roleMatch && visible(el)) {
        matched += 1;
        out.push({
          tagName: clean(el.tagName.toLowerCase(), 40), role: nodeRole,
          text: nodeText, label: label(el),
          inputType: clean(el.getAttribute('type') || '', 40),
          disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
          framePath: frames, shadowPath: shadows,
        });
      }
      if (el.shadowRoot) visit(el.shadowRoot, frames, [...shadows, signature(el)]);
      if (el.tagName === 'IFRAME') {
        try {
          if (el.contentDocument) visit(el.contentDocument, [...frames, signature(el)], shadows);
        } catch (e) { /* cross-origin frame: intentionally unavailable */ }
      }
    }
  };
  const result = visit(document, [], []);
  if (result && result.error) return { elements: [], truncated: false, error: result.error };
  return { elements: out, truncated: matched > out.length };
})();`;
}
