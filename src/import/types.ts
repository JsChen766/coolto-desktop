import type {
  ExperienceCategory,
  ExperienceCreateInput,
  ExperienceSummary,
} from "../api/types.js";

export interface ExperienceImportCandidate
  extends ExperienceCreateInput {
  clientId: string;
  category: ExperienceCategory;
  tags: string[];
}

export interface DuplicateExperience {
  id: string;
  title: string;
}

export interface ProposedExperience {
  candidate: ExperienceImportCandidate;
  selected: boolean;
  duplicateOf?: DuplicateExperience;
  savedExperienceId?: string;
}

export interface ExperienceImportProposal {
  id: string;
  sourceType: "text" | "file";
  sourceLabel?: string;
  candidates: ProposedExperience[];
  createdAt: string;
}

export interface CandidateDuplicateMatch {
  candidateIndex: number;
  existing: Pick<ExperienceSummary, "id" | "title">;
}
