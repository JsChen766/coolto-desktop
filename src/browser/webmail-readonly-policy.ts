export interface ReadOnlyWebmailClickTarget {
  tagName: string;
  type: string | null;
  role: string | null;
  ariaLabel: string;
  text: string;
  value: string;
  name: string;
  id: string;
  testId: string;
  title: string;
  href: string;
  className?: string;
  download: boolean;
  inForm: boolean;
}

const ALLOWED_TOOLS = new Set([
  "browser_list_tabs", "browser_get_active_tab", "browser_new_tab",
  "browser_select_tab", "browser_close_tab", "browser_navigate",
  "browser_go_back", "browser_go_forward", "browser_reload",
  "browser_wait_for", "browser_query_elements", "browser_snapshot",
  "browser_tag_elements", "browser_click_element", "browser_scroll_to",
  "browser_hover", "extract_page", "capture_browser_mail_event",
]);

const BLOCKED_ACTION = new RegExp([
  "删除", "彻底删除", "归档", "移动", "标记为已读", "标记为未读",
  "垃圾邮件", "举报", "设置", "写信", "新邮件", "回复", "转发",
  "下载", "附件", "delete", "trash", "archive", "move(?: to)?",
  "mark as (?:un)?read", "junk", "spam", "report", "settings?",
  "preferences?", "compose", "new mail", "reply(?: all)?", "forward",
  "download", "attachment", "sweep", "block sender", "flag", "pin",
].join("|"), "iu");

const SAFE_BUTTON = new RegExp([
  "收件箱", "下一页", "上一页", "刷新", "返回", "展开", "折叠", "更多",
  "关闭", "打开", "搜索", "较新", "较早", "inbox", "next", "previous",
  "refresh", "back", "expand", "collapse", "more", "close", "open",
  "search", "newer", "older", "load more", "dismiss",
].join("|"), "iu");

const SAFE_ROLES = new Set(["option", "row", "listitem", "treeitem", "tab"]);

export function isReadOnlyWebmailToolAllowed(toolName: string): boolean {
  return ALLOWED_TOOLS.has(toolName);
}

export function evaluateReadOnlyWebmailClick(
  origin: string,
  target: ReadOnlyWebmailClickTarget,
): { allow: boolean; reason?: string } {
  const text = clickText(target);
  if (target.download) {
    return {
      allow: false,
      reason: "只读 Webmail 任务禁止发送、回复、删除、移动、归档、下载或修改邮箱状态",
    };
  }
  if (target.href && !isSameOrigin(origin, target.href)) {
    return { allow: false, reason: "只读 Webmail 任务禁止打开邮件中的外部链接" };
  }
  const tag = target.tagName.toLowerCase();
  const role = (target.role ?? "").toLowerCase();
  if (SAFE_ROLES.has(role)) return { allow: true };
  if (BLOCKED_ACTION.test(text)) {
    return {
      allow: false,
      reason: "只读 Webmail 任务禁止发送、回复、删除、移动、归档、下载或修改邮箱状态",
    };
  }
  if (isNetease163MailRow(origin, target)) return { allow: true };
  if (tag === "a" && target.href) return { allow: true };
  if ((tag === "button" || role === "button") && SAFE_BUTTON.test(text)) {
    return { allow: true };
  }
  return {
    allow: false,
    reason: "无法确认该控件是只读邮件导航动作，请用户接管后再继续",
  };
}

function isNetease163MailRow(
  origin: string,
  target: ReadOnlyWebmailClickTarget,
): boolean {
  let host: string;
  try { host = new URL(origin).hostname.toLowerCase(); }
  catch { return false; }
  const classes = new Set((target.className ?? "").split(/\s+/u).filter(Boolean));
  return host === "hw.mail.163.com" &&
    target.tagName.toLowerCase() === "div" &&
    (target.role ?? "").toLowerCase() === "link" &&
    classes.has("rF0") && classes.has("nui-txt-flag0");
}

function clickText(target: ReadOnlyWebmailClickTarget): string {
  return [
    target.ariaLabel, target.text, target.value, target.name,
    target.id, target.testId, target.title, target.href,
  ].filter(Boolean).join(" | ");
}

function isSameOrigin(origin: string, href: string): boolean {
  try { return new URL(href, origin).origin === origin; }
  catch { return false; }
}
