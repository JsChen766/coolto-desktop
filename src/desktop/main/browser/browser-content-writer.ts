import type { WebContents } from "electron";

import type { FormElementSummary } from "../../../browser/types.js";
import { buildTagElementsScript } from "./browser-writer-scripts.js";
import {
  buildClickScript,
  buildFillScript,
  buildScrollScript,
  buildSelectScript,
  buildSetCheckedScript,
} from "./browser-writer-actions.js";
import type { ClickTargetHint } from "./browser-click-guards.js";
import { browserSitePolicyForOrigin } from "../../../browser/site-policy-registry.js";
import { tagAccessibleElements } from "./browser-accessibility-tagger.js";
import { executeInSameOriginFrames } from "./browser-frame-execution.js";
import {
  runWithBrowserClickTargetHighlight,
  runWithBrowserTargetHighlight,
} from "./browser-target-highlight.js";

const MAX_TAG_ELEMENTS = 200;

/**
 * B4: 写脚本可选返回的字段级元数据。fill/select/setChecked 成功时携带；
 * BrowserPageOperator 据此写入 fillLog 供 Overlay 审核阶段展示。
 */
export interface WriteFieldMeta {
  valueBefore: string;
  valueAfter: string;
  label: string;
  elementType:
    | "input"
    | "textarea"
    | "select"
    | "checkbox"
    | "radio"
    | "contenteditable";
}

/**
 * B3: 通过 executeJavaScript 向页面注入写脚本。
 * 只做"注入 + 结果规范化"，不做闸门检查（闸门在 BrowserWindowManager 层）。
 * 页面重渲染后 selector 易失效，因此定位一律走注入的 data-fill-id 属性。
 */
export async function tagPageElements(
  contents: WebContents,
  origin?: string | null,
  preferredText?: string,
): Promise<FormElementSummary[]> {
  const executions = await executeInSameOriginFrames<FormElementSummary[]>(
    contents, buildTagElementsScript(MAX_TAG_ELEMENTS),
  );
  const dom = executions.flatMap((execution) =>
    Array.isArray(execution.value) ? execution.value.map(normalizeSummary) : []);
  if (!origin || !browserSitePolicyForOrigin(origin)) return dom;
  const accessible = (await tagAccessibleElements(
    contents, MAX_TAG_ELEMENTS, preferredText,
  ))
    .map(normalizeSummary);
  const merged = new Map(accessible.map((item) => [item.fillId, item]));
  for (const item of dom) merged.set(item.fillId, item);
  return [...merged.values()].slice(0, MAX_TAG_ELEMENTS);
}

export async function fillPageField(
  contents: WebContents,
  fillId: string,
  value: string,
): Promise<WriteFieldMeta> {
  const result = await runWithBrowserTargetHighlight(contents, fillId, () =>
    contents.executeJavaScript(buildFillScript(fillId, value), true),
  ) as WriteScriptResult;
  ensureOk(result, "fillField");
  return extractMeta(result, "input");
}

export async function selectPageOption(
  contents: WebContents,
  fillId: string,
  value: string,
): Promise<WriteFieldMeta> {
  const result = await runWithBrowserTargetHighlight(contents, fillId, () =>
    contents.executeJavaScript(buildSelectScript(fillId, value), true),
  ) as WriteScriptResult;
  ensureOk(result, "selectOption");
  return extractMeta(result, "select");
}

export async function setPageChecked(
  contents: WebContents,
  fillId: string,
  checked: boolean,
): Promise<WriteFieldMeta> {
  const result = await runWithBrowserTargetHighlight(contents, fillId, () =>
    contents.executeJavaScript(buildSetCheckedScript(fillId, checked), true),
  ) as WriteScriptResult;
  ensureOk(result, "setChecked");
  return extractMeta(result, "checkbox");
}

export async function scrollPageToElement(
  contents: WebContents,
  fillId: string,
): Promise<void> {
  const result = await runWithBrowserTargetHighlight(contents, fillId, () =>
    contents.executeJavaScript(buildScrollScript(fillId), true),
  ) as WriteScriptResult;
  ensureOk(result, "scrollTo");
}

/**
 * 点击的两阶段：先读元素属性回传主进程判定，若判定放行再执行点击。
 * 拆两阶段是为了把「是否为提交按钮」的决策留在主进程（可测、可加正则），
 * 而不是硬塞进注入脚本里。
 */
export async function readClickTargetHint(
  contents: WebContents,
  fillId: string,
): Promise<ClickTargetHint | null> {
  return (await contents.executeJavaScript(
    buildClickScript(fillId, "read"),
    true,
  )) as ClickTargetHint | null;
}

export async function performPageClick(
  contents: WebContents,
  fillId: string,
): Promise<void> {
  const result = await runWithBrowserClickTargetHighlight(contents, fillId, () =>
    contents.executeJavaScript(buildClickScript(fillId, "click"), true),
  ) as WriteScriptResult;
  ensureOk(result, "click");
}

interface WriteScriptResult {
  ok: boolean;
  reason?: string;
  valueBefore?: string;
  valueAfter?: string;
  label?: string;
  elementType?: string;
}

function ensureOk(result: WriteScriptResult, op: string): void {
  if (!result || result.ok) return;
  throw new Error(result.reason ?? `${op} 执行失败`);
}

function extractMeta(
  result: WriteScriptResult,
  fallbackType: WriteFieldMeta["elementType"],
): WriteFieldMeta {
  const raw = String(result.elementType ?? fallbackType);
  const elementType = normalizeMetaType(raw, fallbackType);
  return {
    valueBefore: String(result.valueBefore ?? "").slice(0, 500),
    valueAfter: String(result.valueAfter ?? "").slice(0, 500),
    label: String(result.label ?? "").slice(0, 200),
    elementType,
  };
}

function normalizeMetaType(
  value: string,
  fallback: WriteFieldMeta["elementType"],
): WriteFieldMeta["elementType"] {
  switch (value) {
    case "input":
    case "textarea":
    case "select":
    case "checkbox":
    case "radio":
    case "contenteditable":
      return value;
    default:
      return fallback;
  }
}

function normalizeSummary(raw: FormElementSummary): FormElementSummary {
  return {
    fillId: String(raw.fillId ?? ""),
    elementType: normalizeElementType(raw.elementType),
    ...(raw.inputType ? { inputType: String(raw.inputType) } : {}),
    ...(raw.role ? { role: String(raw.role).slice(0, 80) } : {}),
    ...(raw.text ? { text: String(raw.text).slice(0, 300) } : {}),
    label: String(raw.label ?? "").slice(0, 200),
    placeholder: String(raw.placeholder ?? "").slice(0, 200),
    required: Boolean(raw.required),
    ...(raw.currentValue !== undefined
      ? { currentValue: String(raw.currentValue).slice(0, 500) }
      : {}),
  };
}

function normalizeElementType(
  value: FormElementSummary["elementType"] | string | undefined,
): FormElementSummary["elementType"] {
  switch (value) {
    case "input":
    case "textarea":
    case "select":
    case "button":
    case "a":
    case "contenteditable":
      return value;
    default:
      return "other";
  }
}
