import type {
  JdRecord,
  JdSearchOptions,
  JdSearchResult,
} from "../../../api/types.js";
import { projectJobRepository } from "../../../job-assets/repository-projection.js";
import type { JobRepositorySnapshot } from "../../../job-assets/repository-types.js";
import type { ResumeLibraryEntry } from "../../../resume/library/types.js";
import type {
  ApplicationListOptions,
  ApplicationListResult,
  ApplicationRecord,
} from "../../../tracker/types.js";

interface JdSource {
  listJds(options: JdSearchOptions): Promise<JdSearchResult>;
}

interface ApplicationSource {
  listApplications(options: ApplicationListOptions): Promise<ApplicationListResult>;
}

interface ResumeSource {
  list(): Promise<ResumeLibraryEntry[]>;
}

/** Reads the three local projections and returns one immutable UI snapshot. */
export class JobAssetReadService {
  public constructor(
    private readonly jds: JdSource,
    private readonly resumes: ResumeSource,
    private readonly applications: ApplicationSource,
  ) {}

  public async get(): Promise<JobRepositorySnapshot> {
    const [jds, resumes, applications] = await Promise.all([
      readAllJds(this.jds),
      this.resumes.list(),
      readAllApplications(this.applications),
    ]);
    return projectJobRepository({ jds, resumes, applications });
  }
}

async function readAllJds(source: JdSource): Promise<JdRecord[]> {
  return readAll((cursor) => source.listJds({
    ...(cursor ? { cursor } : {}),
    limit: 500,
  }));
}

async function readAllApplications(
  source: ApplicationSource,
): Promise<ApplicationRecord[]> {
  return readAll((cursor) => source.listApplications({
    ...(cursor ? { cursor } : {}),
    limit: 500,
  }));
}

async function readAll<T>(
  page: (cursor?: string) => Promise<{ items: T[]; nextCursor: string | null }>,
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const result = await page(cursor);
    items.push(...result.items);
    if (!result.nextCursor) return items;
    if (seen.has(result.nextCursor)) throw new Error("本地分页游标重复");
    seen.add(result.nextCursor);
    cursor = result.nextCursor;
  } while (cursor);
  return items;
}
