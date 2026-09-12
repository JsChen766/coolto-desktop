import { isReadOnlyWebmailToolAllowed } from "./webmail-readonly-policy.js";
import {
  recruitingSitePolicyForHost, recruitingSitePolicyForOrigin,
} from "./recruiting-site-policy.js";
import { isRecruitingFormFixtureOrigin } from "./recruiting-form-fixture-policy.js";

export {
  BOSS_ZHIPIN_SITE_POLICY,
  JOBSDB_HK_SITE_POLICY,
  LINKEDIN_SITE_POLICY,
  RECRUITING_SITE_POLICIES,
  isRecruitingSitePolicyAllowed,
  recruitingSitePolicyForOrigin,
  recruitingSitePolicyForHost,
  recruitingSitePolicyForSite,
} from "./recruiting-site-policy.js";

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
const RECRUITING_READ_NAVIGATION_TOOLS: Record<string, true> = {
  extract_page: true, browser_snapshot: true, browser_query_elements: true,
  browser_wait_for: true, browser_new_tab: true, browser_select_tab: true,
  browser_close_tab: true, browser_navigate: true, browser_go_back: true,
  browser_go_forward: true, browser_reload: true,
  recognize_recruiting_page: true,
};
const RECRUITING_FORM_OBSERVE_TOOLS: Record<string, true> = {
  browser_recruiting_form_observe: true,
};
const RECRUITING_FORM_WRITE_TOOLS: Record<string, true> = {
  browser_recruiting_form_fill: true,
  browser_recruiting_form_select: true,
  browser_recruiting_form_set_checked: true,
  browser_recruiting_form_upload: true,
  browser_recruiting_form_review: true,
};

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
  let host: string | null = null;
  try { host = origin ? new URL(origin).hostname.toLowerCase() : null; }
  catch { /* malformed origin falls through to the generic guard */ }
  const recruitingPolicy = origin
    ? recruitingSitePolicyForOrigin(origin) : undefined;
  const candidatePolicy = recruitingSitePolicyForHost(host);
  if (candidatePolicy && !recruitingPolicy) return false;
  if (toolName === "browser_submit") {
    if (recruitingPolicy) return false;
    if (origin && browserSitePolicyForOrigin(origin)) return false;
    return Boolean(origin && configuredOrigins(
      "COOLTO_BROWSER_SUBMIT_TEST_ORIGINS",
    ).includes(origin));
  }
  if (recruitingPolicy) {
    if (RECRUITING_FORM_OBSERVE_TOOLS[toolName] === true) return true;
    if (isRecruitingFormFixtureOrigin(origin) &&
        (RECRUITING_FORM_WRITE_TOOLS[toolName] === true ||
          toolName === "request_write_access")) return true;
    return RECRUITING_READ_NAVIGATION_TOOLS[toolName] === true;
  }
  if (RECRUITING_FORM_OBSERVE_TOOLS[toolName] === true ||
      RECRUITING_FORM_WRITE_TOOLS[toolName] === true) return false;
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
