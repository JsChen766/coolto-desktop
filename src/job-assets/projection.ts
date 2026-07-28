import { summarizeApplications } from "./application-summary.js";
import type {
  ApplicationAssetReference,
  JobAssetApplication,
  JobAssetJd,
  JobAssetJdProjection,
  JobAssetProjection,
  JobAssetProjectionInput,
  JobAssetResume,
  JobAssetResumeProjection,
} from "./types.js";

export function projectJobAssets(
  input: JobAssetProjectionInput,
): JobAssetProjection {
  const jds = input.jds.filter(isPresent);
  const resumes = input.resumes.filter(isPresent);
  const applications = input.applications.filter(isPresent);
  const jdById = new Map(jds.map((jd) => [jd.id, jd]));
  const resumeById = new Map(resumes.map((resume) => [resume.id, resume]));
  const applicationsByJd = groupApplications(applications, "jdId");
  const applicationsByResume = groupApplications(applications, "resumeId");
  const resumeProjections = new Map(
    resumes.map((resume) => [
      resume.id,
      projectResume(resume, applicationsByResume.get(resume.id) ?? []),
    ]),
  );

  return {
    jds: jds.map((jd) => projectJd(
      jd,
      resumes,
      resumeProjections,
      applicationsByJd.get(jd.id) ?? [],
    )),
    genericResumes: resumes
      .filter((resume) => resume.jdId === null)
      .map((resume) => requiredResumeProjection(resumeProjections, resume.id)),
    resumesWithMissingJd: resumes
      .filter((resume) => resume.jdId !== null && !jdById.has(resume.jdId))
      .map((resume) => requiredResumeProjection(resumeProjections, resume.id)),
    applicationRelations: applications.map((application) => ({
      application,
      jd: referenceOf(
        application.jdId,
        application.jdTitleSnapshot,
        jdById,
      ),
      resume: referenceOf(
        application.resumeId,
        application.resumeTitleSnapshot,
        resumeById,
      ),
    })),
  };
}

function projectJd(
  jd: JobAssetJd,
  resumes: readonly JobAssetResume[],
  resumeProjections: ReadonlyMap<string, JobAssetResumeProjection>,
  applications: readonly JobAssetApplication[],
): JobAssetJdProjection {
  const linkedResumes = resumes
    .filter((resume) => resume.jdId === jd.id)
    .map((resume) => requiredResumeProjection(resumeProjections, resume.id));
  return {
    jd,
    resumes: linkedResumes,
    resumeCount: linkedResumes.length,
    applicationSummary: summarizeApplications(applications),
  };
}

function projectResume(
  resume: JobAssetResume,
  applications: readonly JobAssetApplication[],
): JobAssetResumeProjection {
  return { resume, applicationSummary: summarizeApplications(applications) };
}

function requiredResumeProjection(
  projections: ReadonlyMap<string, JobAssetResumeProjection>,
  resumeId: string,
): JobAssetResumeProjection {
  const projection = projections.get(resumeId);
  if (!projection) throw new Error(`Resume projection ${resumeId} is missing`);
  return projection;
}

function groupApplications(
  applications: readonly JobAssetApplication[],
  key: "jdId" | "resumeId",
): Map<string, JobAssetApplication[]> {
  const grouped = new Map<string, JobAssetApplication[]>();
  for (const application of applications) {
    const id = application[key];
    if (!id) continue;
    const group = grouped.get(id) ?? [];
    group.push(application);
    grouped.set(id, group);
  }
  return grouped;
}

function referenceOf(
  id: string | null,
  titleSnapshot: string | null,
  assets: ReadonlyMap<string, unknown>,
): ApplicationAssetReference {
  return {
    id,
    titleSnapshot,
    state: id === null ? "empty" : assets.has(id) ? "linked" : "missing",
  };
}

function isPresent<T extends { deletedAt: string | null }>(value: T): boolean {
  return value.deletedAt === null;
}
