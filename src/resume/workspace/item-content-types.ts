export type ResumeItemTier = "main" | "secondary" | "utility";

export interface ResumeItemLineBudget {
  tier: ResumeItemTier;
  targetLines: number;
  minimumLines: number;
}

export type ResumeBulletOrigin = "grounded" | "agent_augmented";
export type ResumeBulletConfirmation =
  | "not_required"
  | "pending"
  | "confirmed";

export interface ResumeBulletProvenance {
  bulletId: string;
  itemId: string;
  origin: ResumeBulletOrigin;
  evidenceIds: string[];
  requirementIds: string[];
  confirmation: ResumeBulletConfirmation;
}
