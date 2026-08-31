export interface DeliveryResumeFileRenameInput {
  fileId: string;
  title: string;
}

export interface DeliveryResumeFileSelectInput {
  fileId: string;
}

export interface DeliveryResumeFilesDesktopApi {
  list(): Promise<import("../../../delivery-resume-files/types.js").DeliveryResumeFile[]>;
  importFile(): Promise<
    import("../../../delivery-resume-files/types.js").DeliveryResumeFile | undefined
  >;
  rename(input: DeliveryResumeFileRenameInput): Promise<
    import("../../../delivery-resume-files/types.js").DeliveryResumeFile
  >;
  select(input: DeliveryResumeFileSelectInput): Promise<
    import("../../../delivery-resume-files/types.js").DeliveryResumeFile
  >;
  delete(input: DeliveryResumeFileSelectInput): Promise<void>;
}
