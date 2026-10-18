export type MaterialViewStatus =
  | "unclassified" | "queued" | "processing" | "needs_confirmation"
  | "ready" | "failed" | "expired";

export interface MaterialView {
  materialId: string;
  title: string;
  mediaKind: string;
  sourceKind: string;
  sourceLabel: string | null;
  originalFilename: string | null;
  capturedAt: string;
  contentHash: string;
  contentVersion: number;
  classification: "unclassified" | "classified";
  status: MaterialViewStatus;
  processingStatus: "unprocessed" | "processing" | "completed" | "failed";
  previewText: string | null;
  previewTruncated: boolean;
  ocrConfidence: number | null;
  needsUserConfirmation: boolean;
  expiresAt: string | null;
  relationCount: number;
  citationCount: number;
  relatedExperienceIds: string[];
  lastError: string | null;
}
export interface MaterialSearchOptions {
  query?: string;
  status?: MaterialViewStatus;
  classification?: "unclassified" | "classified";
  limit?: number;
}

export interface MaterialSelectedFileMetadata {
  id: string;
  filename: string;
  type: "pdf" | "docx" | "text" | "markdown" | "png" | "jpg" | "jpeg";
  sizeBytes: number;
}

export interface MaterialDeleteImpact {
  materialId: string;
  confirmationToken: string;
  affectedExperiences: Array<{ experienceId: string; citationCount: number }>;
  publishedAssetsPreserved: boolean;
}

export interface MaterialImportViewInput {
  fileId: string;
  title?: string;
  sourceLabel?: string | null;
}

export interface MaterialRelationCitationInput {
  kind: string;
  page?: number;
  paragraph?: number;
  sectionLabel?: string | null;
  startOffset?: number;
  endOffset?: number;
}

export interface MaterialRelationTargetInput {
  experienceId: string;
  citations: MaterialRelationCitationInput[];
}

export interface MaterialRelationProposalView {
  proposalId: string;
  materialId: string;
  classification: "unclassified" | "classified";
  status: "pending" | "executing" | "needs_user_decision" | "approved" | "rejected";
  experienceIds: string[];
}

export interface MaterialExportReceipt {
  recordCount: number;
  byteLength: number;
  sha256: string;
}

export interface MaterialApi {
  select(): Promise<MaterialSelectedFileMetadata[]>;
  list(options?: MaterialSearchOptions): Promise<MaterialView[]>;
  get(materialId: string): Promise<MaterialView | undefined>;
  import(input: MaterialImportViewInput): Promise<MaterialView>;
  processOcr(materialId: string): Promise<MaterialView>;
  confirmOcr(materialId: string, correctedText?: string): Promise<MaterialView>;
  prepareRelation(input: {
    materialId: string;
    classification: "unclassified" | "classified";
    experienceReferences: MaterialRelationTargetInput[];
  }): Promise<MaterialRelationProposalView>;
  approveRelation(proposalId: string): Promise<MaterialRelationProposalView>;
  rejectRelation(proposalId: string): Promise<void>;
  previewDelete(materialId: string): Promise<MaterialDeleteImpact>;
  cancelDelete(confirmationToken: string): Promise<void>;
  confirmDelete(confirmationToken: string): Promise<void>;
  exportPackage(): Promise<MaterialExportReceipt | null>;
  restorePackage(): Promise<number | null>;
}
