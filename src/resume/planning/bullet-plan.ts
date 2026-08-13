export interface PlanningParameters {
  charsPerLine: number;
  lineHeightPx: number;
  availableHeightPx: number;
  /** Reserved vertical space for header, section headings and item titles. */
  fixedLines: number;
}

export interface BulletPlan {
  bulletIndex: number;
  itemId: string;
  experienceId: string;
  evidenceIds: string[];
  /** Deterministic text length target so a bullet lands at 1.7-2.0 lines. */
  targetChars: { min: number; max: number };
}

export interface WritingPlan {
  parameters: PlanningParameters;
  maxBulletLines: number;
  totalBulletLines: number;
  bullets: BulletPlan[];
  /** Unassigned evidence kept as slack for mechanical repairs. */
  reservedEvidenceIds: string[];
  /** Shortfall of available source chars vs the planned target chars. */
  evidenceGapChars: number;
  /** Estimated maximum usage ratio the available evidence can physically reach. */
  estimatedMaxUsageRatio: number;
  /** True when the material cannot physically reach the 85% page gate. */
  insufficient: boolean;
  /** How many source chars a user would need to add to reach the gate. */
  additionalCharsNeeded: number;
}
