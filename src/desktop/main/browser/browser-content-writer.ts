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

const MAX_TAG_ELEMENTS = 200;

/**
 * B3: 通过 executeJavaScript 向页面注入写脚本。
 * 只做"注入 + 结果规范化"，不做闸门检查（闸门在 BrowserWindowManager 层）。
 * 页面重渲染后 selector 易失效，因此定位一律走注入的 data-fill-id 属性。
 */
export async function tagPageElements(
  contents: WebContents,
): Promise<FormElementSummary[]> {
  const raw = (await contents.executeJavaScript(
    buildTagElementsScript(MAX_TAG_ELEMENTS),
    true,
  )) as FormElementSummary[];
  return Array.isArray(raw) ? raw.map(normalizeSummary) : [];
}

export async function fillPageField(
  contents: WebContents,
  fillId: string,
  value: string,
): Promise<void> {
  const result = (await contents.executeJavaScript(
    buildFillScript(fillId, value),
    true,
  )) as WriteScriptResult;
  ensureOk(result, "fillField");
}

export async function selectPageOption(
  contents: WebContents,
  fillId: string,
  value: string,
): Promise<void> {
  const result = (await contents.executeJavaScript(
    buildSelectScript(fillId, value),
    true,
  )) as WriteScriptResult;
  ensureOk(result, "selectOption");
}

export async function setPageChecked(
  contents: WebContents,
  fillId: string,
  checked: boolean,
): Promise<void> {
  const result = (await contents.executeJavaScript(
    buildSetCheckedScript(fillId, checked),
    true,
  )) as WriteScriptResult;
  ensureOk(result, "setChecked");
}

export async function scrollPageToElement(
  contents: WebContents,
  fillId: string,
): Promise<void> {
  const result = (await contents.executeJavaScript(
    buildScrollScript(fillId),
    true,
  )) as WriteScriptResult;
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
  const result = (await contents.executeJavaScript(
    buildClickScript(fillId, "click"),
    true,
  )) as WriteScriptResult;
  ensureOk(result, "click");
}

interface WriteScriptResult {
  ok: boolean;
  reason?: string;
}

function ensureOk(result: WriteScriptResult, op: string): void {
  if (!result || result.ok) return;
  throw new Error(result.reason ?? `${op} 执行失败`);
}

function normalizeSummary(raw: FormElementSummary): FormElementSummary {
  return {
    fillId: String(raw.fillId ?? ""),
    elementType: normalizeElementType(raw.elementType),
    ...(raw.inputType ? { inputType: String(raw.inputType) } : {}),
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
      return value;
    default:
      return "other";
  }
}
