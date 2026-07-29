import type { JdRecord } from "../api/types.js";
import type { ResumeLibraryEntry } from "../resume/library/types.js";
import type { ApplicationRecord } from "../tracker/types.js";
import type { JobRepositoryReference } from "./repository-types.js";

export function jdReference(
  id: string | null,
  snapshot: string | null,
  jds: ReadonlyMap<string, JdRecord>,
): JobRepositoryReference {
  if (!id) return { id: null, title: snapshot?.trim() || "未关联 JD", state: "empty" };
  const jd = jds.get(id);
  return {
    id,
    title: jd?.title ?? snapshot?.trim() ?? "引用 JD 已缺失",
    state: jd ? "linked" : "missing",
  };
}

export function resumeReference(
  id: string | null,
  snapshot: string | null,
  resumes: ReadonlyMap<string, ResumeLibraryEntry>,
): JobRepositoryReference {
  if (!id) {
    return { id: null, title: snapshot?.trim() || "未关联 Resume", state: "empty" };
  }
  const resume = resumes.get(id);
  return {
    id,
    title: resume?.displayTitle ?? snapshot?.trim() ?? "引用 Resume 已缺失",
    state: resume ? "linked" : "missing",
  };
}

export function uniqueJdReferences(
  applications: readonly ApplicationRecord[],
  jds: ReadonlyMap<string, JdRecord>,
): JobRepositoryReference[] {
  return uniqueReferences(applications.map((application) =>
    jdReference(application.jdId, application.jdTitleSnapshot, jds),
  ));
}

export function uniqueOtherResumeReferences(
  applications: readonly ApplicationRecord[],
  targetedResumeIds: ReadonlySet<string>,
  resumes: ReadonlyMap<string, ResumeLibraryEntry>,
): JobRepositoryReference[] {
  return uniqueReferences(
    applications
      .filter((application) =>
        !application.resumeId || !targetedResumeIds.has(application.resumeId),
      )
      .map((application) =>
        resumeReference(
          application.resumeId,
          application.resumeTitleSnapshot,
          resumes,
        ),
      ),
  );
}

function uniqueReferences(
  references: readonly JobRepositoryReference[],
): JobRepositoryReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.state}:${reference.id ?? reference.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
