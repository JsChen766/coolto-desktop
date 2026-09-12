import type {
  RecruitingCapability,
  RecruitingSiteId,
  RecruitingSurfaceKind,
  SupportedRecruitingSiteId,
} from "../agent-task/recruiting-surface-types.js";
import { recruitingFormFixturePolicyForOrigin } from "./recruiting-form-fixture-policy.js";

export interface RecruitingSitePolicyV1 {
  version: 1;
  siteId: SupportedRecruitingSiteId;
  name: string;
  status: "candidate" | "verified" | "blocked";
  fixtureOrigins: readonly string[];
  productionOrigins: readonly string[];
  domains: readonly string[];
  loginMode: "user_takeover" | "not_required";
  capabilities: readonly RecruitingCapability[];
  takeoverSurfaces: readonly RecruitingSurfaceKind[];
  deniedActions: readonly string[];
  verifiedAt: string | null;
  contentTrust: "external_untrusted";
  termsEvidence: string | null;
  authorizationEvidence: string | null;
  rateLimit: string | null;
  defaultMode: "assisted" | "read_only" | "unattended";
}

const COMMON_CAPABILITIES = Object.freeze<readonly RecruitingCapability[]>([
  "read", "match", "fill", "upload", "field_review",
  "takeover_required", "final_submit_confirmation_required",
]);
const TAKEOVER_SURFACES = Object.freeze<readonly RecruitingSurfaceKind[]>([
  "auth", "otp", "captcha", "legal_declaration", "sensitive_question",
  "submit_confirmation",
]);
const DENIED_ACTIONS = Object.freeze([
  "password.write", "otp.write", "captcha.solve", "legal.accept",
  "sensitive_identity.answer", "browser.submit.unattended",
]);
const CANDIDATE_ALLOWED_CAPABILITIES: Record<string, true> = {
  read: true, match: true, takeover_required: true,
};
export const BOSS_ZHIPIN_SITE_POLICY: RecruitingSitePolicyV1 = policy({
  siteId: "boss_zhipin",
  name: "BOSS 直聘（候选）",
  fixtureHost: "boss-zhipin.test",
  productionOrigin: "https://www.zhipin.com",
});
export const JOBSDB_HK_SITE_POLICY: RecruitingSitePolicyV1 = policy({
  siteId: "jobsdb_hk",
  name: "JobsDB 香港（候选）",
  fixtureHost: "jobsdb-hk.test",
  productionOrigin: "https://hk.jobsdb.com",
});
export const LINKEDIN_SITE_POLICY: RecruitingSitePolicyV1 = policy({
  siteId: "linkedin",
  name: "LinkedIn（候选）",
  fixtureHost: "linkedin.test",
  productionOrigin: "https://www.linkedin.com",
});

export const RECRUITING_SITE_POLICIES = Object.freeze([
  BOSS_ZHIPIN_SITE_POLICY, JOBSDB_HK_SITE_POLICY, LINKEDIN_SITE_POLICY,
] as const);

export function recruitingSitePolicyForSite(
  siteId: RecruitingSiteId,
): RecruitingSitePolicyV1 | undefined {
  return RECRUITING_SITE_POLICIES.find((policy) => policy.siteId === siteId);
}

export function recruitingSitePolicyForOrigin(
  origin: string | null,
): RecruitingSitePolicyV1 | undefined {
  const normalized = httpsOrigin(origin);
  const staticPolicy = normalized
    ? RECRUITING_SITE_POLICIES.find((policy) =>
      policy.fixtureOrigins.includes(normalized) ||
      policy.productionOrigins.includes(normalized))
    : undefined;
  if (staticPolicy) return staticPolicy;
  const fixture = recruitingFormFixturePolicyForOrigin(origin);
  return fixture
    ? RECRUITING_SITE_POLICIES.find((policy) => policy.siteId === fixture.siteId)
    : undefined;
}
export function recruitingSitePolicyForHost(
  host: string | null,
): RecruitingSitePolicyV1 | undefined {
  const normalized = host?.trim().toLowerCase().replace(/\.$/u, "");
  if (!normalized) return undefined;
  return RECRUITING_SITE_POLICIES.find((policy) =>
    policy.domains.includes(normalized));
}

export function isRecruitingSitePolicyAllowed(
  origin: string | null,
  capability: RecruitingCapability,
): boolean {
  const policy = recruitingSitePolicyForOrigin(origin);
  if (!policy || policy.status === "blocked" || capability === "unsupported") {
    return false;
  }
  if (policy.status !== "verified") {
    return CANDIDATE_ALLOWED_CAPABILITIES[capability] === true;
  }
  return policy.capabilities.includes(capability);
}

function policy(input: {
  siteId: SupportedRecruitingSiteId;
  name: string;
  fixtureHost: string;
  productionOrigin: string;
}): RecruitingSitePolicyV1 {
  const production = httpsOrigin(input.productionOrigin);
  if (!production) throw new Error("招聘站点生产 origin 必须为无凭据 HTTPS");
  const productionHost = new URL(production).hostname;
  const fixtureOrigin = `https://${input.fixtureHost}`;
  const invalidHost = input.fixtureHost.replace(/\.test$/u, "");
  const invalidOrigin = `https://${invalidHost}.invalid`;
  return Object.freeze({
    version: 1,
    siteId: input.siteId,
    name: input.name,
    status: "candidate",
    fixtureOrigins: Object.freeze([fixtureOrigin, invalidOrigin]),
    productionOrigins: Object.freeze([production]),
    domains: Object.freeze([input.fixtureHost, `${invalidHost}.invalid`, productionHost]),
    loginMode: "user_takeover",
    capabilities: COMMON_CAPABILITIES,
    takeoverSurfaces: TAKEOVER_SURFACES,
    deniedActions: DENIED_ACTIONS,
    verifiedAt: null,
    contentTrust: "external_untrusted",
    termsEvidence: null,
    authorizationEvidence: null,
    rateLimit: null,
    defaultMode: "assisted",
  });
}

function httpsOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.origin : null;
  } catch {
    return null;
  }
}
