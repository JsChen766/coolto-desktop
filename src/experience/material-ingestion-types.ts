import type { ExperienceCategory } from "../api/types.js";

export type ExperienceMaterialSource =
  | { kind: "file"; fileId: string; selectedTexts?: string[] }
  | { kind: "web"; selectedTexts?: string[] }
  | { kind: "text"; selectedTexts: string[] };

export type ExperienceMaterialTarget =
  | { kind: "existing"; experienceId: string }
  | {
      kind: "new";
      category: ExperienceCategory;
      title: string;
      organization: string | null;
      role: string | null;
      location: string | null;
      startDate: string | null;
      endDate: string | null;
      tags: string[];
    };

export interface ExperienceMaterialChunkView {
  chunkId: string;
  label: string;
  text: string;
  index: number;
  total: number;
  numbers: string[];
  criticalTexts: string[];
  minimumDetailChars: number;
}

export interface ExperienceMaterialCommitInput {
  target: ExperienceMaterialTarget;
  sourceHash: string;
  sourceLabel: string;
  capturedAt: string;
  numberCount: number;
  criticalOutputCount: number;
  sections: Array<{ label: string; text: string }>;
}

export interface ExperienceMaterialCommitResult {
  experienceId: string;
  title: string;
  created: boolean;
  duplicate: boolean;
  addedCharacters: number;
  sectionCount: number;
  numberCount: number;
  criticalOutputCount: number;
}

export interface ExperienceMaterialCommitter {
  commit(input: ExperienceMaterialCommitInput): Promise<ExperienceMaterialCommitResult>;
}
