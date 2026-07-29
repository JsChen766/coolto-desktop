import type {
  JobFilter,
  RepositoryView,
  ResumeFilter,
} from "./job-repository-filter";

export interface JobRepositoryNavigationState {
  view: RepositoryView;
  query: string;
  jobFilter: JobFilter;
  resumeFilter: ResumeFilter;
  selectedJdId: string | null;
  selectedResumeId: string | null;
  detailOpen: boolean;
}

export function defaultJobRepositoryNavigation(): JobRepositoryNavigationState {
  return {
    view: "jobs",
    query: "",
    jobFilter: "",
    resumeFilter: "",
    selectedJdId: null,
    selectedResumeId: null,
    detailOpen: false,
  };
}
