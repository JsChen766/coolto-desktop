export type SupportedImportFileType = "pdf" | "docx" | "text" | "markdown";

export interface SelectedFileMetadata {
  id: string;
  filename: string;
  type: SupportedImportFileType;
  sizeBytes: number;
}

export interface SelectedFileContent {
  metadata: SelectedFileMetadata;
  content: Buffer;
}
