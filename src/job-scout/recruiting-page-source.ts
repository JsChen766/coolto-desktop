import { canonicalHash } from "../agent-task/canonical-hash.js";
import {
  isRecruitingWriteCapability,
  type RecruitingAccessibilityObservation,
  type RecruitingFrameShadowSummary,
  type RecruitingPageObservation,
  type RecruitingPageRecognition,
} from "../agent-task/recruiting-surface-types.js";
import {
  recognizeRecruitingPage,
  recruitingObservationIsCurrent,
} from "../browser/recruiting-page-recognition.js";
import { isRecruitingSitePolicyAllowed } from "../browser/recruiting-site-policy.js";
import type { BrowserAccessibilityNode } from "../browser/agent-control-types.js";
import type { PageSnapshot } from "../browser/types.js";

export interface RecruitingPageSourceInput {
  page: PageSnapshot;
  origin?: string | null;
  headings?: readonly string[];
  landmarks?: readonly string[];
  accessibility?: readonly BrowserAccessibilityNode[];
  frameShadowSummary?: RecruitingFrameShadowSummary;
  frameSummary?: RecruitingFrameShadowSummary;
  observationHash?: string | null;
}

export interface RecruitingPageSourceResult {
  observation: RecruitingPageObservation;
  recognition: RecruitingPageRecognition;
  trust: "external_untrusted";
}

export function observeRecruitingPage(
  input: RecruitingPageSourceInput,
): RecruitingPageSourceResult {
  const observation = buildObservation(input);
  return {
    observation,
    recognition: recognizeRecruitingPage(observation),
    trust: "external_untrusted",
  };
}

export const readRecruitingPageSource = observeRecruitingPage;

export function assertRecruitingObservationCurrent(
  result: RecruitingPageSourceResult,
  expectedHash: string | null,
): void {
  if (!recruitingObservationIsCurrent(result.recognition, expectedHash)) {
    throw new Error("招聘页面观察已变化，请重新观察后再继续");
  }
}
export function isRecruitingCapabilityAvailable(
  result: RecruitingPageSourceResult,
  capability: Parameters<typeof isRecruitingSitePolicyAllowed>[1],
  currentObservationHash: string | null,
): boolean {
  if (!result.recognition.capabilities.includes(capability)) return false;
  if (isRecruitingWriteCapability(capability) &&
      !recruitingObservationIsCurrent(
        result.recognition, currentObservationHash,
      )) return false;
  return isRecruitingSitePolicyAllowed(result.observation.origin, capability);
}

export const canUseRecruitingCapability = isRecruitingCapabilityAvailable;

function buildObservation(
  input: RecruitingPageSourceInput,
): RecruitingPageObservation {
  const frameShadowSummary = input.frameShadowSummary ?? input.frameSummary;
  const hash = input.observationHash?.trim() || canonicalHash({
    url: input.page.url,
    title: input.page.title,
    text: input.page.text,
    formFields: input.page.formFields.map((field) => ({
      label: field.label, name: field.name, inputType: field.inputType,
      placeholder: field.placeholder, required: field.required,
    })),
    headings: Array.from(input.headings ?? []),
    landmarks: Array.from(input.landmarks ?? []),
    accessibility: input.accessibility?.map((node) => ({
      role: node.role, name: node.name, value: node.value,
      description: node.description, disabled: node.disabled,
    })) ?? [],
    frameShadowSummary: {
      sameOriginFrames: frameShadowSummary?.sameOriginFrames ?? 0,
      crossOriginFrames: frameShadowSummary?.crossOriginFrames ?? 0,
      openShadowRoots: frameShadowSummary?.openShadowRoots ?? 0,
    },
  });
  const accessibility = input.accessibility?.map(toAccessibility);
  return {
    origin: input.origin === undefined ? pageOrigin(input.page.url) : input.origin,
    url: input.page.url,
    text: input.page.text,
    title: input.page.title,
    ...(input.headings ? { headings: [...input.headings] } : {}),
    ...(input.landmarks ? { landmarks: [...input.landmarks] } : {}),
    formSummaries: input.page.formFields.map((field) => ({
      label: field.label, name: field.name, inputType: field.inputType,
      placeholder: field.placeholder, required: field.required,
    })),
    ...(accessibility ? { accessibility } : {}),
    ...(frameShadowSummary ? { frameShadowSummary } : {}),
    observationHash: hash,
  };
}

function toAccessibility(
  node: BrowserAccessibilityNode,
): RecruitingAccessibilityObservation {
  return {
    role: node.role, name: node.name, value: node.value,
    description: node.description, disabled: node.disabled,
  };
}

function pageOrigin(url: string): string | null {
  try { return new URL(url).origin; } catch { return null; }
}
