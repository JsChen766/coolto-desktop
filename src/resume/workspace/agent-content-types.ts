import type { ResumeBulletOrigin } from "./types.js";

export interface AgentBulletContentInput {
  bulletId?: string;
  text: string;
  origin: ResumeBulletOrigin;
  evidenceIds?: readonly string[];
  requirementIds?: readonly string[];
}

export interface AgentItemContentInput {
  itemId: string;
  bullets: readonly AgentBulletContentInput[];
}

export interface AgentAugmentedFragmentInput {
  bulletId: string;
  baseText: string;
  fragmentText: string;
  appliedText: string;
  requirementIds: readonly string[];
}
