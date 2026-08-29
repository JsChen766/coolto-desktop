export interface ResumeReuseBase {
  kind?: "cloud" | "local" | "composite";
  resumeId: string;
  sourceJdId: string | null;
  contentHash: string;
  retainedBulletCount: number;
  droppedBulletCount: number;
  sources?: Array<{
    experienceId: string;
    kind: "cloud" | "local";
    sourceId: string;
    updatedAt: string;
  }>;
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
