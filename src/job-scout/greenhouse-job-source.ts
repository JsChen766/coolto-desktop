import type { JobSourceListing } from "../agent-task/browser-lead-types.js";
import {
  assertSourceKey,
  plainText,
  readJson,
  type JobSourceFetch,
  type JobSourceResult,
} from "./job-source-fetch.js";

interface GreenhouseJob {
  id?: unknown;
  title?: unknown;
  location?: { name?: unknown };
  content?: unknown;
  absolute_url?: unknown;
  updated_at?: unknown;
}

export async function fetchGreenhouseJobs(
  boardToken: string,
  company: string,
  fetcher: JobSourceFetch = fetch,
  signal?: AbortSignal,
): Promise<JobSourceResult> {
  const key = assertSourceKey(boardToken, "Greenhouse board token");
  const value = await readJson(await fetcher(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(key)}/jobs?content=true`,
    signal ? { signal } : {},
  ), "Greenhouse Job Board API");
  const jobs = (value as { jobs?: unknown })?.jobs;
  if (!Array.isArray(jobs)) throw new Error("Greenhouse jobs 响应格式无效");
  return {
    company: company.trim() || key,
    listings: jobs.map((job) => normalize(job as GreenhouseJob, company || key)),
  };
}

function normalize(job: GreenhouseJob, company: string): JobSourceListing {
  if ((typeof job.id !== "number" && typeof job.id !== "string") ||
      typeof job.title !== "string" || typeof job.absolute_url !== "string") {
    throw new Error("Greenhouse job 缺少 id/title/absolute_url");
  }
  return {
    externalId: String(job.id),
    company,
    role: job.title,
    location: String(job.location?.name ?? ""),
    workplaceType: null,
    description: plainText(job.content),
    targetUrl: job.absolute_url,
    sourceUpdatedAt: typeof job.updated_at === "string" ? job.updated_at : null,
  };
}
