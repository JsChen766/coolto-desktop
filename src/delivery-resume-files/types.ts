export type DeliveryResumeFileType = "pdf" | "docx";
export type DeliveryResumeSlot = 1 | 2 | 3;

/**
 * A user-owned delivery file is intentionally not a Resume or ResumeDraft.
 * It is an immutable local attachment that may be selected for any JD.
 */
export interface DeliveryResumeFile {
  id: string;
  title: string;
  originalFilename: string;
  type: DeliveryResumeFileType;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  preferred: boolean;
  slot: DeliveryResumeSlot | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryResumeFileCodec {
  encodeText(value: string): Uint8Array;
  decodeText(value: Uint8Array): string;
  encodeBytes(value: Uint8Array): Uint8Array;
  decodeBytes(value: Uint8Array): Uint8Array;
}

export interface DeliveryResumeFileSource {
  list(): Promise<DeliveryResumeFile[]>;
  get(fileId: string): Promise<DeliveryResumeFile>;
  setPreferred(fileId: string): Promise<DeliveryResumeFile>;
  stage(fileId: string): Promise<string>;
}

export interface DeliveryResumeFileStore extends DeliveryResumeFileSource {
  importContent(
    filename: string,
    content: Uint8Array,
  ): Promise<DeliveryResumeFile>;
}
