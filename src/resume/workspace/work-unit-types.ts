export type ResumeWorkUnitKind =
  | "project"
  | "report"
  | "initiative"
  | "responsibility"
  | "deliverable"
  | "skill_group";

export interface ResumeWorkUnit {
  workUnitId: string;
  itemId: string;
  sourceExperienceId: string;
  label: string;
  kind: ResumeWorkUnitKind;
  evidenceIds: string[];
}

export interface ResumeWorkUnitMap {
  version: "work-units-v1";
  sourceFingerprint: string;
  status: "pending" | "ready";
  units: ResumeWorkUnit[];
}

export interface ResumeWorkUnitInput {
  itemId: string;
  units: Array<{
    label: string;
    kind: ResumeWorkUnitKind;
    evidenceIds: string[];
  }>;
}
