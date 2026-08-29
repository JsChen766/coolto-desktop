import { isReadOnlyWebmailToolAllowed } from "./webmail-readonly-policy.js";

export interface BrowserSitePolicyV1 {
  version: 1;
  id: string;
  name: string;
  domains: string[];
  status: "candidate" | "verified" | "blocked";
  loginMode: "user_takeover" | "not_required";
  capabilities: Array<"read" | "control" | "capture_mail" | "submit">;
  deniedActions: string[];
  knownSideEffects: string[];
  verifiedAt: string | null;
}

const READ_ONLY_DENIED_ACTIONS = [
  "mail.send", "mail.delete", "mail.move", "mail.archive",
  "mail.mark_read", "attachment.download", "message.external_link.open",
  "mail.settings.write",
];

export const QQ_MAIL_SITE_POLICY = personalWebmailPolicy(
  "qq-mail-personal-web-v1", "个人 QQ 邮箱", "mail.qq.com",
);

export const OUTLOOK_PERSONAL_SITE_POLICY = personalWebmailPolicy(
  "outlook-personal-web-v1", "个人 Outlook 邮箱",
  ["outlook.live.com", "outlook.office.com", "outlook.cloud.microsoft"],
);

export const NETEASE_163_PERSONAL_SITE_POLICY = personalWebmailPolicy(
  "netease-163-personal-web-v1", "163 个人邮箱",
  ["mail.163.com", "hw.mail.163.com"],
);

const POLICIES = [
  QQ_MAIL_SITE_POLICY,
  OUTLOOK_PERSONAL_SITE_POLICY,
  NETEASE_163_PERSONAL_SITE_POLICY,
] as const;

export function browserSitePolicyForOrigin(
  origin: string,
): BrowserSitePolicyV1 | undefined {
  let host: string;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return undefined;
    host = url.hostname.toLowerCase();
  } catch { return undefined; }
  return POLICIES.find((policy) =>
    policy.domains.some((domain) => host === domain));
}

export function isBrowserSitePolicyAllowed(
  origin: string | null,
  toolName: string,
): boolean {
  if (toolName === "browser_list_tabs" || toolName === "browser_get_active_tab") {
    return true;
  }
  if (toolName === "browser_submit") {
    if (origin && browserSitePolicyForOrigin(origin)) return false;
    return Boolean(origin && configuredOrigins(
      "COOLTO_BROWSER_SUBMIT_TEST_ORIGINS",
    ).includes(origin));
  }
  if (toolName === "capture_browser_mail_event") {
    if (!origin) return false;
    const policy = browserSitePolicyForOrigin(origin);
    if (!policy || policy.status === "blocked" ||
        !policy.capabilities.includes("capture_mail")) return false;
    return policy.status === "verified" || configuredOrigins(
      "COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS",
    ).includes(origin);
  }
  const webmailPolicy = origin ? browserSitePolicyForOrigin(origin) : undefined;
  if (webmailPolicy && (toolName.startsWith("browser_") ||
      toolName === "extract_page" || toolName === "request_write_access" ||
      toolName === "prepare_application_submission")) {
    return isReadOnlyWebmailToolAllowed(toolName);
  }
  if (!toolName.startsWith("browser_") && toolName !== "extract_page" &&
      toolName !== "request_write_access" &&
      toolName !== "prepare_application_submission") return true;
  if (!origin) return false;
  try {
    return ["http:", "https:"].includes(new URL(origin).protocol);
  } catch { return false; }
}

function personalWebmailPolicy(
  id: string,
  name: string,
  domain: string | string[],
): Readonly<BrowserSitePolicyV1> {
  return Object.freeze<BrowserSitePolicyV1>({
    version: 1, id, name,
    domains: Array.isArray(domain) ? [...domain] : [domain],
    status: "candidate",
    loginMode: "user_takeover",
    capabilities: ["read", "control", "capture_mail"],
    deniedActions: [...READ_ONLY_DENIED_ACTIONS],
    knownSideEffects: ["打开具体邮件可能由站点自动标记为已读"],
    verifiedAt: null,
  });
}

function configuredOrigins(name: string): string[] {
  return (process.env[name] ?? "").split(",")
    .map((value) => value.trim()).filter(Boolean);
}
