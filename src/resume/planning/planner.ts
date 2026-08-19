import type { BulletPlan, PlanningParameters, WritingPlan } from "./bullet-plan.js";
import { RESUME_GLOBAL_MINIMUM_USAGE_RATIO } from "../compiler-types.js";

/**
 * Shared planning constants and types for the agent-orchestrated flow.
 * Budget numbers are handed to the agent as facts (via
 * workspace layout context); the agent makes all layout
 * decisions, so no host-side planner remains.
 */
export const MIN_TAIL_RATIO = 0.7;
export const MINIMUM_USAGE_RATIO = RESUME_GLOBAL_MINIMUM_USAGE_RATIO;
export const TARGET_CHARS_PER_LINE_FACTOR = 1.68;
export const MAX_EVIDENCE_PER_BULLET = 3;
/**
 * Observed paraphrase expansion ceilings used only to estimate the physical
 * material ceiling (estimatedMaxUsageRatio) for the agent's layout budget.
 */
export const EXPANSION_FACTOR_ZH = 2.4;
export const EXPANSION_FACTOR_EN = 5.4;

export { type BulletPlan, type PlanningParameters, type WritingPlan } from "./bullet-plan.js";
