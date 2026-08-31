import type { WebContents } from "electron";

import type { PageSnapshot } from "../../../browser/types.js";
import { executeInSameOriginFrames } from "./browser-frame-execution.js";

const MAX_TEXT_LENGTH = 20_000;
const MAX_FORM_FIELDS = 80;

/**
 * B2: 只读读取浏览器页面内容。
 * 通过 webContents.executeJavaScript 注入一段**只读**脚本，一次性提取
 * 标题、URL、meta、og 标签、清洗后的可见正文、表单字段概览。
 * 不修改 DOM、不点击、不导航。
 */
export async function readPageSnapshot(
  contents: WebContents,
): Promise<PageSnapshot> {
  const executions = await executeInSameOriginFrames<PageSnapshot>(
    contents, buildReaderScript(MAX_TEXT_LENGTH, MAX_FORM_FIELDS),
  );
  const snapshots = executions.map((execution) => normalizeSnapshot(execution.value));
  const main = snapshots[0] ?? normalizeSnapshot({} as PageSnapshot);
  const composed = composeSnapshotText(
    snapshots.map((snapshot) => snapshot.text), MAX_TEXT_LENGTH,
  );
  return {
    ...main,
    text: composed.text,
    textTruncated: composed.truncated ||
      snapshots.some((snapshot) => snapshot.textTruncated),
    formFields: snapshots.flatMap((snapshot) => snapshot.formFields)
      .slice(0, MAX_FORM_FIELDS),
  };
}

export function composeSnapshotText(
  values: string[],
  maxLength: number,
): { text: string; truncated: boolean } {
  const texts = values.filter(Boolean);
  const fullText = texts.join("\n");
  if (fullText.length <= maxLength) {
    return { text: fullText, truncated: false };
  }
  const separators = Math.max(0, texts.length - 1);
  const perFrame = Math.max(1, Math.floor((maxLength - separators) / texts.length));
  return {
    text: texts.map((text) => text.slice(0, perFrame)).join("\n").slice(0, maxLength),
    truncated: true,
  };
}

function normalizeSnapshot(raw: PageSnapshot): PageSnapshot {
  return {
    url: String(raw.url ?? ""),
    title: String(raw.title ?? ""),
    metaDescription: String(raw.metaDescription ?? ""),
    ogTitle: String(raw.ogTitle ?? ""),
    ogDescription: String(raw.ogDescription ?? ""),
    text: String(raw.text ?? ""),
    textTruncated: Boolean(raw.textTruncated),
    formFields: Array.isArray(raw.formFields) ? raw.formFields : [],
  };
}

function buildReaderScript(maxText: number, maxFields: number): string {
  return `(() => {
  const meta = (name) => {
    const el = document.querySelector('meta[name="' + name + '"]')
      || document.querySelector('meta[property="' + name + '"]');
    return el ? (el.getAttribute('content') || '') : '';
  };
  const clone = document.body ? document.body.cloneNode(true) : null;
  if (clone) {
    clone.querySelectorAll('script,style,noscript,template,svg').forEach((n) => n.remove());
  }
  const rawText = clone ? (clone.innerText || clone.textContent || '') : '';
  const text = rawText.replace(/[\\t\\f\\r ]+/g, ' ').replace(/\\n{3,}/g, '\\n\\n').trim();
  const truncated = text.length > ${maxText};
  const labelFor = (el) => {
    if (el.id) {
      const l = document.querySelector('label[for="' + el.id + '"]');
      if (l && l.innerText) return l.innerText.trim();
    }
    const wrap = el.closest('label');
    if (wrap && wrap.innerText) return wrap.innerText.trim();
    return el.getAttribute('aria-label') || '';
  };
  const fields = [];
  const nodes = document.querySelectorAll('input, textarea, select');
  for (const el of nodes) {
    if (fields.length >= ${maxFields}) break;
    const type = el.tagName === 'SELECT'
      ? 'select'
      : (el.getAttribute('type') || (el.tagName === 'TEXTAREA' ? 'textarea' : 'text'));
    if (type === 'hidden') continue;
    fields.push({
      label: (labelFor(el) || '').slice(0, 200),
      name: (el.getAttribute('name') || '').slice(0, 200),
      inputType: type,
      placeholder: (el.getAttribute('placeholder') || '').slice(0, 200),
      required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
    });
  }
  return {
    url: location.href,
    title: document.title || '',
    metaDescription: meta('description'),
    ogTitle: meta('og:title'),
    ogDescription: meta('og:description'),
    text: text.slice(0, ${maxText}),
    textTruncated: truncated,
    formFields: fields,
  };
})();`;
}
