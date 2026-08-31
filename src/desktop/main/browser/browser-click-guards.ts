import { browserSitePolicyForOrigin } from "../../../browser/site-policy-registry.js";
import {
  evaluateReadOnlyWebmailClick,
  type ReadOnlyWebmailClickTarget,
} from "../../../browser/webmail-readonly-policy.js";

/**
 * B3: 提交/发送按钮判定。用于 browser_click_element 拒绝点击提交/发送。
 * 通过页面注入脚本读取候选元素的关键属性后，在主进程用类型 + 文本正则双闸判定。
 *
 * 判定原则：
 *  1) 类型闸：<button type="submit"> / <input type="submit"|"image"> 直接拒绝
 *  2) 语义闸：可见文本 / aria-label / value / name / id / data-testid 命中中英文正则拒绝
 *  3) 提交别名：常见"下一步/继续"若同时位于 form 里且带 submit 语义时也拒绝
 *
 * 页面文本视为不可信数据；判定只用于「拒绝」，永远不当作「许可」凭据。
 */

export type ClickTargetHint = ReadOnlyWebmailClickTarget;

const SUBMIT_TEXT_PATTERN =
  /(提交|投递|申请|应聘|发送|发布|保存并提交|一键投递|立即投递|立即申请|\b(?:submit|send|apply|post|deliver)\b)/i;

const SOFT_NEXT_PATTERN = /(下一步|继续|next|continue)/i;

export interface ClickGuardResult {
  allow: boolean;
  reason?: string;
}

export function evaluateClickTarget(
  hint: ClickTargetHint,
  origin?: string | null,
): ClickGuardResult {
  const type = (hint.type ?? "").toLowerCase();
  const tag = hint.tagName.toLowerCase();
  if (tag === "input" && (type === "submit" || type === "image")) {
    return { allow: false, reason: "目标是 <input type=submit/image>，属于提交控件，Agent 禁止点击" };
  }
  if (tag === "button" && type === "submit") {
    return { allow: false, reason: "目标是 <button type=submit>，属于提交控件，Agent 禁止点击" };
  }

  const haystack = [
    hint.ariaLabel,
    hint.text,
    hint.value,
    hint.name,
    hint.id,
    hint.testId,
    hint.title,
  ]
    .map((v) => v ?? "")
    .join(" | ")
    .trim();

  if (haystack && SUBMIT_TEXT_PATTERN.test(haystack)) {
    return {
      allow: false,
      reason: `目标按钮文案疑似提交/发送（匹配到「${firstMatch(haystack, SUBMIT_TEXT_PATTERN)}」），Agent 禁止点击；请让用户手动点击最终提交按钮`,
    };
  }

  if (
    hint.inForm &&
    haystack &&
    SOFT_NEXT_PATTERN.test(haystack) &&
    (type === "submit" || (tag === "button" && !type))
  ) {
    return {
      allow: false,
      reason:
        "目标位于表单内且是 submit/未声明 type 的按钮，含「下一步/继续」等推进语义，" +
        "为避免误触发提交流程，Agent 禁止点击",
    };
  }

  if (origin && browserSitePolicyForOrigin(origin)) {
    return evaluateReadOnlyWebmailClick(origin, hint);
  }

  return { allow: true };
}

export function isSubmissionTarget(hint: ClickTargetHint): boolean {
  const type = (hint.type ?? "").toLowerCase();
  const tag = hint.tagName.toLowerCase();
  if ((tag === "input" && ["submit", "image"].includes(type)) ||
      (tag === "button" && type === "submit")) return true;
  const haystack = [
    hint.ariaLabel, hint.text, hint.value, hint.name,
    hint.id, hint.testId, hint.title,
  ].join(" | ");
  if (SUBMIT_TEXT_PATTERN.test(haystack)) return true;
  return hint.inForm && SOFT_NEXT_PATTERN.test(haystack) &&
    (type === "submit" || (tag === "button" && !type));
}

function firstMatch(input: string, pattern: RegExp): string {
  const m = input.match(pattern);
  return m ? m[0] : "";
}
