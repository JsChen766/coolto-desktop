import type { JobRepositoryJd, JobRepositoryResume } from "@desktop/types";
import type { TrackerAssetTarget } from "../tracker/tracker-navigation";

export function jdTrackerTarget(jd: JobRepositoryJd): TrackerAssetTarget {
  return { kind: "jd", id: jd.id, title: jd.title };
}

export function resumeTrackerTarget(
  resume: JobRepositoryResume,
): TrackerAssetTarget | undefined {
  return resume.resumeId
    ? { kind: "resume", id: resume.resumeId, title: resume.entry.displayTitle }
    : undefined;
}
