import {
  hasFreshRecruitingObservation,
  isRecruitingWriteCapability,
  type RecruitingCapability,
  type RecruitingFrameShadowSummary,
  type RecruitingFormSummary,
  type RecruitingPageObservation,
  type RecruitingPageRecognition,
  type RecruitingSurfaceKind,
} from "../agent-task/recruiting-surface-types.js";
import {
  recruitingSitePolicyForOrigin,
  type RecruitingSitePolicyV1,
} from "./recruiting-site-policy.js";
import { recruitingFormFixturePolicyForOrigin } from "./recruiting-form-fixture-policy.js";
const CAPTCHA = /captcha|reCAPTCHA|hcaptcha|geetest|slider|robot|人机验证|图形验证码/iu;
const CHALLENGE = /请稍候|checking your browser|verify you are human|cloudflare|安全验证|验证您不是自动程序/iu;
const OTP = /\botp\b|one[- ]time|verification code|短信验证码|手机验证码|动态验证码|验证码/iu;
const AUTH = /\blog[ -]?in\b|sign[ -]?in|register|登录|注册|账号|密码/iu;
const SENSITIVE = /eeo|gender|race|ethnicity|religion|disab|veteran|sexual orientation|social security|国籍|民族|宗教|性别|残疾|退伍|婚姻|身份证|身份信息/iu;
const LEGAL = /terms|privacy|consent|legal|agreement|声明|条款|隐私|授权|同意/iu;
const BODY_SENSITIVE = /(?:what(?:'s| is) your|do you identify as|select|please (?:provide|choose)|voluntary|equal employment(?: opportunity)?|gender identity|race or ethnicity|veteran status|disability status|sexual orientation|one[- ]time verification|verification code|短信验证码|手机验证码|动态验证码|验证码|国籍|民族|宗教|性别|残疾|退伍|婚姻|身份证|身份信息|\bgender\b(?!\s+equality)|\brace\b(?!\s+condition)|\breligion\b|\bveteran(?:\s+status)?\b|\bdisability(?:\s+status)?\b)/iu;
const BODY_LEGAL = /(?:agree|accept|consent|acknowledge)[\s\S]{0,80}(?:terms|privacy|legal|agreement|条款|隐私|授权|声明)|(?:terms|privacy|legal|agreement|条款|隐私|授权|声明)[\s\S]{0,80}(?:agree|accept|consent|acknowledge)/iu;
const SUBMIT_CONFIRMATION = /application(?: was)? received|thank you for applying|submission (?:confirmed|received)|申请已提交|投递成功|提交成功|确认提交/iu;
const APPLICATION = /apply|application|candidate|resume|curriculum vitae|\bcv\b|申请|应聘|投递|简历/iu;
const LISTING = /job listings?|openings?|positions?|careers?|search|岗位列表|职位列表|招聘|职位搜索/iu;
const DETAIL_PATH = /\/(?:jobs?|positions?|roles?)\/[^/]+/iu;
const LIST_PATH = /\/(?:jobs?|positions?|roles?)(?:\/)?$/iu;
const BODY_NOISE_ROLES: Record<string, true> = {
  link: true, navigation: true, banner: true, button: true,
  contentinfo: true, header: true, footer: true, nav: true,
};
const BODY_REGION_START: Record<string, true> = {
  banner: true, navigation: true, contentinfo: true,
  header: true, footer: true, nav: true,
};
const BODY_REGION_END: Record<string, true> = { main: true, form: true };
export function normalizeRecruitingFrameSummary(
  value: unknown,
): RecruitingFrameShadowSummary | null {
  if (!value || typeof value !== "object") return null;
  const same = Reflect.get(value, "sameOriginFrames");
  const cross = Reflect.get(value, "crossOriginFrames");
  const shadow = Reflect.get(value, "openShadowRoots");
  if (!nonNegativeInteger(same) || !nonNegativeInteger(cross) ||
      (shadow !== undefined && !nonNegativeInteger(shadow))) return null;
  return {
    sameOriginFrames: same,
    crossOriginFrames: cross,
    openShadowRoots: shadow === undefined ? 0 : shadow,
  };
}
function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
const SURFACE_CAPABILITIES: Record<RecruitingSurfaceKind, RecruitingCapability[]> = {
  job_listing: ["read", "match"],
  job_detail: ["read", "match"],
  application_form: ["read", "match", "fill", "upload", "field_review",
    "final_submit_confirmation_required"],
  auth: ["takeover_required"],
  otp: ["takeover_required"],
  captcha: ["takeover_required"],
  legal_declaration: ["takeover_required"],
  sensitive_question: ["takeover_required"],
  submit_confirmation: ["takeover_required", "final_submit_confirmation_required"],
  unknown: ["unsupported"],
};
export function recognizeRecruitingPage(
  input: RecruitingPageObservation,
): RecruitingPageRecognition {
  const observationHash = normalizeObservationHash(input.observationHash);
  const origin = trustedOrigin(input.origin);
  const urlOrigin = trustedOrigin(input.url);
  if (!origin || !urlOrigin || origin !== urlOrigin) {
    return unknownRecognition(observationHash);
  }
  const policy = recruitingSitePolicyForOrigin(origin);
  if (!policy) return unknownRecognition(observationHash);
  const surfaceKind = classifySurface(input);
  if (surfaceKind === "unknown") {
    return unknownRecognition(observationHash, policy.siteId);
  }
  const frameTopologyUnsafe = hasUnsafeFrameTopology(input);
  return {
    siteId: policy.siteId,
    surfaceKind,
    capabilities: capabilitiesFor(
      policy, surfaceKind, observationHash, frameTopologyUnsafe,
    ),
    fallback: fallbackFor(surfaceKind),
    observationHash,
  };
}

export const recognizeRecruitingSurface = recognizeRecruitingPage;
export function recruitingObservationIsCurrent(
  recognition: RecruitingPageRecognition,
  expectedHash: string | null,
): boolean {
  return hasFreshRecruitingObservation(recognition, expectedHash);
}
function classifySurface(input: RecruitingPageObservation): RecruitingSurfaceKind {
  const forms = input.formSummaries ?? input.formFields ?? [];
  const formSignals = forms.map(formSignal).join(" ");
  const pageContext = [input.url, input.title, ...(input.headings ?? []), ...(input.landmarks ?? [])].join(" ");
  const signals = signalText(input, true);
  const contextualBody = forms.length > 0 && APPLICATION.test(pageContext) ? signalText(input, false) : "";
  const riskyBody = contextualBody && (CAPTCHA.test(contextualBody) || CHALLENGE.test(contextualBody) || OTP.test(contextualBody) || /password|passcode|账号|密码|(?:please|enter).{0,40}(?:sign[ -]?in|log[ -]?in)|(?:sign[ -]?in|log[ -]?in|login).{0,40}(?:continue|required|account|to proceed)|登录后|需要登录/iu.test(contextualBody) || SENSITIVE.test(contextualBody.replace(/gender equality|race condition|\bEEO\b/igu, "")) || /\bEEO\s+(?:questions?|disclosure)/iu.test(contextualBody) || BODY_SENSITIVE.test(contextualBody) || BODY_LEGAL.test(contextualBody)) ? contextualBody : "";
  const localSignals = `${signalText(input, false)} ${formSignals} ${riskyBody}`;
  const combined = `${signals} ${formSignals}`;
  if (CAPTCHA.test(localSignals)) return "captcha";
  if (CHALLENGE.test(`${input.title} ${contextualBody}`)) return "captcha";
  if (OTP.test(localSignals)) return "otp";
  if (isAuthSurface(input, forms, localSignals)) return "auth";
  if (SENSITIVE.test(localSignals)) return "sensitive_question";
  if (LEGAL.test(localSignals) && hasLegalControl(forms, localSignals)) return "legal_declaration";
  if (SUBMIT_CONFIRMATION.test(`${localSignals} ${formSignals}`)) return "submit_confirmation";
  if (forms.length > 0 && APPLICATION.test(combined)) return "application_form";
  const path = pathname(input.url);
  if (DETAIL_PATH.test(path) || /\bapply now\b|立即申请|查看职位详情/iu.test(combined)) return "job_detail";
  if (LIST_PATH.test(path) || LISTING.test(combined)) return "job_listing";
  return "unknown";
}
function signalText(input: RecruitingPageObservation, includeBody: boolean): string {
  const nodes = input.accessibility ?? input.accessibilityObservations ?? [];
  let inChromeRegion = false;
  const accessible = nodes.flatMap((node) => {
    const role = node.role?.trim().toLowerCase() ?? "";
    if (BODY_REGION_START[role] === true) { inChromeRegion = true; return []; }
    if (BODY_REGION_END[role] === true) inChromeRegion = false;
    if (inChromeRegion || BODY_NOISE_ROLES[role] === true) return [];
    return [node.role, node.name, node.value, node.description];
  });
  const values = [input.url, input.title, ...(includeBody ? [input.text] : []), ...(input.headings ?? []), ...(input.landmarks ?? []), ...accessible];
  return values.filter((value): value is string => typeof value === "string")
    .map((value) => value.normalize("NFKC").slice(0, 500)).join(" ");
}

function isAuthSurface(
  input: RecruitingPageObservation,
  forms: readonly RecruitingFormSummary[],
  localSignals: string,
): boolean {
  const path = pathname(input.url);
  const authPath = /\/(?:login|signin|register|auth)(?:\/|$)/iu.test(path);
  const authField = forms.some((form) =>
    form.inputType?.trim().toLowerCase() === "password" ||
    AUTH.test(formSignal(form)));
  const authHeading = [input.title, ...(input.headings ?? [])]
    .some((value) => AUTH.test(value));
  return (authPath || authField || authHeading) &&
    !SUBMIT_CONFIRMATION.test(localSignals);
}

function formSignal(form: RecruitingFormSummary): string {
  return [form.label, form.name, form.inputType, form.placeholder, form.role]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function hasLegalControl(
  forms: readonly RecruitingFormSummary[],
  signals: string,
): boolean {
  return forms.some((form) => /checkbox|radio|consent|agree|同意|声明/iu.test(
    formSignal(form),
  )) || BODY_LEGAL.test(signals);
}

function capabilitiesFor(
  policy: RecruitingSitePolicyV1,
  surfaceKind: RecruitingSurfaceKind,
  observationHash: string | null,
  frameTopologyUnsafe: boolean,
): RecruitingCapability[] {
  const requested = SURFACE_CAPABILITIES[surfaceKind];
  const allowed = requested.filter((capability) =>
    policy.capabilities.includes(capability));
  if (frameTopologyUnsafe && surfaceKind === "application_form") {
    const takeoverCapabilities: RecruitingCapability[] = [
      "read", "match", "takeover_required",
      "final_submit_confirmation_required",
    ];
    return takeoverCapabilities.filter((capability) =>
      policy.capabilities.includes(capability));
  }
  if (observationHash || !allowed.some(isRecruitingWriteCapability)) return allowed;
  return allowed.filter((capability) => !isRecruitingWriteCapability(capability))
    .concat("takeover_required");
}
function fallbackFor(surfaceKind: RecruitingSurfaceKind): "manual_takeover" | "read_only" | "unsupported" {
  if (surfaceKind === "unknown") return "unsupported";
  if (surfaceKind === "job_listing" || surfaceKind === "job_detail") return "read_only";
  return "manual_takeover";
}

function unknownRecognition(
  observationHash: string | null,
  siteId: RecruitingPageRecognition["siteId"] = "unknown",
): RecruitingPageRecognition {
  return {
    siteId, surfaceKind: "unknown", capabilities: ["unsupported"],
    fallback: "unsupported", observationHash,
  };
}

function hasUnsafeFrameTopology(input: RecruitingPageObservation): boolean {
  const raw = input.frameShadowSummary ?? input.frameShadow ?? input.frameSummary;
  if (raw === undefined) return false;
  const summary = normalizeRecruitingFrameSummary(raw);
  return !summary || (summary.crossOriginFrames ?? 0) > 0;
}
function normalizeObservationHash(value: string | null): string | null {
  return typeof value === "string" && value.trim().length <= 256 && value.trim()
    ? value.trim() : null;
}

function pathname(url: string): string {
  try { return new URL(url).pathname; } catch { return ""; }
}
function trustedOrigin(value: string | null): string | null {
  const secure = httpsOrigin(value);
  if (secure) return secure;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (![ "http:", "https:" ].includes(url.protocol) ||
        url.username || url.password) return null;
    const origin = url.origin;
    return recruitingFormFixturePolicyForOrigin(origin) ? origin : null;
  } catch {
    return null;
  }
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
