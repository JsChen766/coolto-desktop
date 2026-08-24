import type { WebContents } from "electron";

import type {
  BrowserKeyModifier,
  BrowserKeypressRequest,
} from "../../../browser/agent-control-types.js";
import { ELEMENT_HELPERS_SCRIPT } from "./browser-element-scripts.js";

const NAMED_KEYS = new Set([
  "Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "PageUp", "PageDown", "Home", "End", "Backspace", "Delete",
]);
const FORBIDDEN_KEYS = new Set(["Enter", "NumpadEnter", "Space", " "]);

export function normalizeAgentKeypress(input: BrowserKeypressRequest): {
  key: string;
  modifiers: BrowserKeyModifier[];
} {
  const key = input.key.trim();
  if (!key || FORBIDDEN_KEYS.has(key)) {
    throw new Error("Agent 禁止按 Enter/Space；提交、发送或激活按钮必须由专用安全工具处理");
  }
  if (key.length !== 1 && !NAMED_KEYS.has(key)) {
    throw new Error("不支持的按键");
  }
  return { key, modifiers: [...new Set(input.modifiers ?? [])] };
}

export async function performAgentKeypress(
  contents: WebContents,
  request: BrowserKeypressRequest,
): Promise<void> {
  if (request.fillId) {
    const focused = await contents.executeJavaScript(`(() => {
      ${ELEMENT_HELPERS_SCRIPT}
      const el = findEl(${JSON.stringify(request.fillId)});
      if (!el || typeof el.focus !== 'function') return false;
      el.focus(); return true;
    })()`, true);
    if (!focused) throw new Error("按键目标元素不存在或不可聚焦");
  }
  const { key, modifiers } = normalizeAgentKeypress(request);
  contents.sendInputEvent({ type: "keyDown", keyCode: key, modifiers });
  if (key.length === 1 && !modifiers.some((value) => value !== "shift")) {
    contents.sendInputEvent({ type: "char", keyCode: key, modifiers });
  }
  contents.sendInputEvent({ type: "keyUp", keyCode: key, modifiers });
  await new Promise((resolve) => setTimeout(resolve, 20));
}

export async function hoverAgentElement(
  contents: WebContents,
  fillId: string,
): Promise<void> {
  await runPointerScript(contents, fillId, undefined, "hover");
}

export async function dragAgentElement(
  contents: WebContents,
  sourceFillId: string,
  targetFillId: string,
): Promise<void> {
  await runPointerScript(contents, sourceFillId, targetFillId, "drag");
}

async function runPointerScript(
  contents: WebContents,
  sourceId: string,
  targetId: string | undefined,
  mode: "hover" | "drag",
): Promise<void> {
  const result = await contents.executeJavaScript(`(() => {
    ${ELEMENT_HELPERS_SCRIPT}
    const source = findEl(${JSON.stringify(sourceId)});
    if (!source) return { ok: false, reason: 'source_not_found' };
    const mouse = (el, type) => el.dispatchEvent(new (el.ownerDocument.defaultView.MouseEvent)(type, {
      bubbles: true, cancelable: true, view: el.ownerDocument.defaultView
    }));
    if (${JSON.stringify(mode)} === 'hover') {
      mouse(source, 'mouseover'); mouse(source, 'mouseenter'); mouse(source, 'mousemove');
      return { ok: true };
    }
    const target = findEl(${JSON.stringify(targetId ?? "")});
    if (!target) return { ok: false, reason: 'target_not_found' };
    const transfer = new (source.ownerDocument.defaultView.DataTransfer)();
    const drag = (el, type) => el.dispatchEvent(new (el.ownerDocument.defaultView.DragEvent)(type, {
      bubbles: true, cancelable: true, dataTransfer: transfer,
      view: el.ownerDocument.defaultView
    }));
    drag(source, 'dragstart'); drag(target, 'dragenter'); drag(target, 'dragover');
    drag(target, 'drop'); drag(source, 'dragend');
    return { ok: true };
  })()`, true) as { ok?: boolean; reason?: string };
  if (!result?.ok) throw new Error(result?.reason ?? `${mode} 执行失败`);
}
