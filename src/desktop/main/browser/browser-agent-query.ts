import type { WebContents } from "electron";

import type {
  BrowserElementQuery,
  BrowserElementQueryResult,
} from "../../../browser/agent-control-types.js";
import { executeInSameOriginFrames } from "./browser-frame-execution.js";

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
  const executions = await executeInSameOriginFrames<
    BrowserElementQueryResult & { error?: string }
  >(contents, buildElementQueryScript({ selector, text, role, limit }));
  const elements = [];
  let truncated = false;
  for (const execution of executions) {
    if (execution.value.error) throw new Error(execution.value.error);
    truncated ||= execution.value.truncated;
    for (const element of execution.value.elements) {
      if (elements.length >= limit) { truncated = true; break; }
      elements.push({
        ...element,
        framePath: [...execution.framePath, ...element.framePath],
      });
    }
  }
  return {
    elements,
    truncated,
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
      const nodeLabel = label(el);
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
      const searchableText = clean(nodeText + ' ' + nodeLabel);
      const textMatch = !wanted.text || searchableText.toLowerCase()
        .includes(wanted.text.toLowerCase());
      const roleMatch = !wanted.role || nodeRole === wanted.role;
      if (selectorMatch && textMatch && roleMatch && visible(el)) {
        matched += 1;
        out.push({
          tagName: clean(el.tagName.toLowerCase(), 40), role: nodeRole,
          text: nodeText, label: nodeLabel,
          inputType: clean(el.getAttribute('type') || '', 40),
          disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
          framePath: frames, shadowPath: shadows,
        });
      }
      if (el.shadowRoot) visit(el.shadowRoot, frames, [...shadows, signature(el)]);
    }
  };
  const result = visit(document, [], []);
  if (result && result.error) return { elements: [], truncated: false, error: result.error };
  return { elements: out, truncated: matched > out.length };
})();`;
}
