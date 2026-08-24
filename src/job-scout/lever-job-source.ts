import type { JobSourceListing } from "../agent-task/browser-lead-types.js";
import {
  assertSourceKey,
  plainText,
  readJson,
  type JobSourceFetch,
  type JobSourceResult,
} from "./job-source-fetch.js";

interface LeverJob {
  id?: unknown;
  text?: unknown;
  hostedUrl?: unknown;
  descriptionPlain?: unknown;
  description?: unknown;
  workplaceType?: unknown;
  categories?: { location?: unknown };
  createdAt?: unknown;
}

export async function fetchLeverJobs(
  site: string,
  company: string,
  fetcher: JobSourceFetch = fetch,
  signal?: AbortSignal,
): Promise<JobSourceResult> {
  const key = assertSourceKey(site, "Lever site");
  const value = await readJson(await fetcher(
    `https://api.lever.co/v0/postings/${encodeURIComponent(key)}?mode=json`,
    { headers: { Accept: "application/json" }, ...(signal ? { signal } : {}) },
  ), "Lever Postings API");
  if (!Array.isArray(value)) throw new Error("Lever postings 响应格式无效");
  return {
    company: company.trim() || key,
    listings: value.map((job) => normalize(job as LeverJob, company || key)),
  };
}

function normalize(job: LeverJob, company: string): JobSourceListing {
  if (typeof job.id !== "string" || typeof job.text !== "string" ||
      typeof job.hostedUrl !== "string") {
    throw new Error("Lever posting 缺少 id/text/hostedUrl");
  }
  return {
    externalId: job.id,
    company,
    role: job.text,
    location: String(job.categories?.location ?? ""),
    workplaceType: typeof job.workplaceType === "string" ? job.workplaceType : null,
    description: typeof job.descriptionPlain === "string"
      ? job.descriptionPlain.trim()
      : plainText(job.description),
    targetUrl: job.hostedUrl,
    sourceUpdatedAt: typeof job.createdAt === "number"
      ? new Date(job.createdAt).toISOString() : null,
  };
}
