import type { JobRepositoryJd, JobRepositoryResume } from "@desktop/types";

export type RepositoryView = "jobs" | "resumes";
export type JobFilter = "" | "with_resumes" | "without_resumes" | "applied" | "conflict";
export type ResumeFilter = "" | "targeted" | "generic" | "archived" | "local_only" | "conflict";

export function filterJds(
  jds: readonly JobRepositoryJd[],
  query: string,
  filter: JobFilter,
): JobRepositoryJd[] {
  const needle = normalize(query);
  return jds.filter((jd) => {
    if (needle && !normalize([jd.title, jd.company, jd.targetRole].join(" ")).includes(needle)) {
      return false;
    }
    if (filter === "with_resumes") return jd.targetedResumeIds.length > 0;
    if (filter === "without_resumes") return jd.targetedResumeIds.length === 0;
    if (filter === "applied") return jd.applicationSummary.total > 0;
    if (filter === "conflict") return jd.syncStatus === "conflict";
    return true;
  });
}

export function filterResumes(
  resumes: readonly JobRepositoryResume[],
  query: string,
  filter: ResumeFilter,
): JobRepositoryResume[] {
  const needle = normalize(query);
  return resumes.filter((resume) => {
    const cloud = resume.entry.cloud;
    if (needle && !normalize([
      resume.entry.displayTitle,
      cloud?.targetRole,
      resume.primaryJd.title,
    ].join(" ")).includes(needle)) return false;
    if (filter === "targeted") return resume.kind === "targeted";
    if (filter === "generic") return resume.kind === "generic";
    if (filter === "archived") return cloud?.status === "archived";
    if (filter === "local_only") return resume.kind === "local_only";
    if (filter === "conflict") return resume.entry.syncStatus === "conflict";
    return true;
  });
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
