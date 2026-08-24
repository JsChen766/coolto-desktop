export interface BrowserLeadV1 {
  version: 1;
  id: string;
  ownerId: string;
  taskId: string;
  source: "greenhouse" | "lever";
  sourceKey: string;
  externalId: string;
  dedupeKey: string;
  company: string;
  role: string;
  location: string;
  workplaceType: string | null;
  description: string;
  targetUrl: string;
  contentHash: string;
  sourceUpdatedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  state: "new" | "changed" | "unchanged" | "closed";
}

export interface BrowserLeadEvaluationV1 {
  version: 1;
  id: string;
  ownerId: string;
  taskId: string;
  leadId: string;
  runId: string;
  score: number;
  shortlisted: boolean;
  rationale: string;
  evidenceRefs: string[];
  createdAt: string;
}

export interface JobSourceCursorV1 {
  version: 1;
  ownerId: string;
  taskId: string;
  source: BrowserLeadV1["source"];
  sourceKey: string;
  fetchedAt: string;
  contentHash: string;
  jobCount: number;
}

export interface JobSourceListing {
  externalId: string;
  company: string;
  role: string;
  location: string;
  workplaceType: string | null;
  description: string;
  targetUrl: string;
  sourceUpdatedAt: string | null;
}
