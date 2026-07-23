import type { ResumeTemplateId } from "./types.js";

export interface ResumeTemplateSnapshot {
  templateId: ResumeTemplateId;
  profileVersion: string;
  profileHash: string;
}

export const STANDARD_RESUME_TEMPLATE_SNAPSHOT: ResumeTemplateSnapshot = {
  templateId: "resume-standard",
  profileVersion: "resume-template-v2",
  profileHash:
    "130b516b3eb2f0a5a335ff525eebd3ca43dcce1053ab02a06d384e3a18f09fc0",
};
