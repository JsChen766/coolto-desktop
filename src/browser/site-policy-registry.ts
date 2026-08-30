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

export const QQ_MAIL_SITE_POLICY = Object.freeze<BrowserSitePolicyV1>({
  version: 1,
  id: "qq-mail-personal-web-v1",
  name: "个人 QQ 邮箱",
  domains: ["mail.qq.com"],
  status: "candidate",
  loginMode: "user_takeover",
  capabilities: ["read", "control", "capture_mail"],
  deniedActions: [
    "mail.send", "mail.delete", "mail.move", "mail.archive",
    "mail.mark_read", "attachment.download", "message.external_link.open",
    "mail.settings.write",
  ],
  knownSideEffects: ["打开具体邮件可能由站点自动标记为已读"],
  verifiedAt: null,
});

const POLICIES = [QQ_MAIL_SITE_POLICY] as const;

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
  if (!toolName.startsWith("browser_") && toolName !== "extract_page" &&
      toolName !== "request_write_access" &&
      toolName !== "prepare_application_submission") return true;
  if (!origin) return false;
  try {
    return ["http:", "https:"].includes(new URL(origin).protocol);
  } catch { return false; }
}

function configuredOrigins(name: string): string[] {
  return (process.env[name] ?? "").split(",")
    .map((value) => value.trim()).filter(Boolean);
}
