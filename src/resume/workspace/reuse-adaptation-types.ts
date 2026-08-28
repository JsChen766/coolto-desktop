export interface ResumeReuseBase {
  kind?: "cloud" | "local";
  resumeId: string;
  sourceJdId: string;
  contentHash: string;
  retainedBulletCount: number;
  droppedBulletCount: number;
}

export interface ResumeReuseAdaptation {
  status: "pending" | "completed";
  sourceJdId: string;
  targetJdId: string;
  retainedBulletIds: string[];
  targetItemIds: string[];
  adaptedItemIds: string[];
  uncoveredRequirementIds: string[];
  completedRevision?: number;
}
