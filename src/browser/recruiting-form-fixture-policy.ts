import type {
  RecruitingCapability,
  RecruitingSiteId,
} from "../agent-task/recruiting-surface-types.js";

export type RecruitingFormFixtureCapability = Extract<
  RecruitingCapability, "read" | "match" | "fill" | "upload" | "field_review"
>;
export type RecruitingFixtureSiteId = Exclude<RecruitingSiteId, "unknown">;
export interface RecruitingFormFixturePolicyV1 {
  version: 1;
  siteId: RecruitingFixtureSiteId;
  origin: string;
  origins: readonly string[];
  mode: "synthetic_review";
  capabilities: readonly RecruitingFormFixtureCapability[];
  deniedActions: readonly string[];
  trust: "external_untrusted";
}

const CAPABILITIES: readonly RecruitingFormFixtureCapability[] = Object.freeze([
  "read", "match", "fill", "upload", "field_review",
]);
const DENIED_ACTIONS = Object.freeze([
  "auth.write", "otp.write", "captcha.solve", "legal.accept",
  "sensitive_identity.answer", "submit", "application.create",
]);
const SITE_IDS: Record<string, RecruitingFixtureSiteId> = {
  boss_zhipin: "boss_zhipin", jobsdb_hk: "jobsdb_hk", linkedin: "linkedin",
};
export const RECRUITING_FORM_FIXTURE_POLICIES = Object.freeze([
  policy("boss_zhipin", "boss-zhipin"),
  policy("jobsdb_hk", "jobsdb-hk"),
  policy("linkedin", "linkedin"),
] as const);

export function recruitingFormFixturePolicyForOrigin(
  origin: string | null,
): RecruitingFormFixturePolicyV1 | undefined {
  const normalized = normalizeOrigin(origin) ?? normalizeConfiguredOrigin(origin);
  const staticPolicy = RECRUITING_FORM_FIXTURE_POLICIES.find((item) =>
    item.origins.includes(normalized ?? ""));
  if (staticPolicy || !normalized) return staticPolicy;
  for (const item of configuredFixtureEntries()) {
    if (item.origin === normalized) return configuredPolicy(item.siteId, normalized);
  }
  return undefined;
}
export function isRecruitingFormFixtureOrigin(origin: string | null): boolean {
  return recruitingFormFixturePolicyForOrigin(origin) !== undefined;
}

function policy(siteId: RecruitingFixtureSiteId, host: string): RecruitingFormFixturePolicyV1 {
  const origin = `https://${host}.test`;
  return Object.freeze({
    version: 1, siteId, origin,
    origins: Object.freeze([origin, `https://${host}.invalid`]),
    mode: "synthetic_review", capabilities: CAPABILITIES,
    deniedActions: DENIED_ACTIONS, trust: "external_untrusted",
  });
}
function configuredPolicy(siteId: RecruitingFixtureSiteId, origin: string): RecruitingFormFixturePolicyV1 {
  const base = RECRUITING_FORM_FIXTURE_POLICIES.find((item) => item.siteId === siteId)!;
  return Object.freeze({ ...base, origin, origins: Object.freeze([origin]) });
}
function configuredFixtureEntries(): Array<{ siteId: RecruitingFixtureSiteId; origin: string }> {
  return (process.env.COOLTO_RECRUITING_FORM_FIXTURE_ORIGINS ?? "").split(",")
    .map((raw) => raw.trim()).map((raw) => {
      const separator = raw.indexOf("=");
      const siteId = SITE_IDS[separator > 0 ? raw.slice(0, separator).trim() : ""];
      const origin = normalizeConfiguredOrigin(separator > 0 ? raw.slice(separator + 1).trim() : null);
      return siteId && origin ? { siteId, origin } : undefined;
    }).filter((item): item is { siteId: RecruitingFixtureSiteId; origin: string } => Boolean(item));
}
function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        (url.pathname !== "/" && url.pathname !== "")) return null;
    return url.origin;
  } catch { return null; }
}
function normalizeConfiguredOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
    if (!local || !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}
