export type SupportedImportFileType =
  | "pdf"
  | "docx"
  | "text"
  | "markdown";

export type SupportedMaterialFileType =
  | SupportedImportFileType
  | "png"
  | "jpg"
  | "jpeg";

export interface SelectedFileMetadata {
  id: string;
  filename: string;
  type: SupportedImportFileType;
  sizeBytes: number;
}

export interface MaterialSelectedFileMetadata {
  id: string;
  filename: string;
  type: SupportedMaterialFileType;
  sizeBytes: number;
}

export interface SelectedFileContent {
  metadata: SelectedFileMetadata;
  content: Buffer;
}

export interface MaterialSelectedFileContent {
  metadata: MaterialSelectedFileMetadata;
  content: Buffer;
}

export interface SelectedFileContent {
  metadata: SelectedFileMetadata;
  content: Buffer;
}
