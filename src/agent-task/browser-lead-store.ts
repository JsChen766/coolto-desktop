import type { AgentHarnessStateRepository } from "./agent-harness-state-repository.js";
import type {
  BrowserLeadEvaluationV1,
  BrowserLeadV1,
  JobSourceListing,
} from "./browser-lead-types.js";
import { canonicalHash } from "./canonical-hash.js";
import type { JsonValue } from "./json-types.js";
import { requireTask } from "./agent-task-store.js";
import { uuidV7 } from "./uuid-v7.js";

export class BrowserLeadStore {
  public constructor(
    private readonly ownerId: string,
    private readonly repository: AgentHarnessStateRepository,
  ) {}

  public ingest(input: {
    taskId: string;
    source: BrowserLeadV1["source"];
    sourceKey: string;
    company: string;
    listings: JobSourceListing[];
  }): Promise<BrowserLeadV1[]> {
    if (input.listings.length > 1_000) {
      return Promise.reject(new Error("单次 Job Source 最多返回 1000 个岗位"));
    }
    return this.repository.update((state) => {
      requireTask(state.tasks, input.taskId, this.ownerId);
      const now = new Date().toISOString();
      const seen = new Set<string>();
      const output = input.listings.map((raw) => {
        const listing = normalizeListing(raw, input.company);
        const dedupeKey = canonicalHash(
          `${input.source}:${input.sourceKey}:${listing.externalId}`,
        );
        seen.add(dedupeKey);
        const contentHash = canonicalHash(listing as unknown as JsonValue);
        const existing = state.browserLeads.find((lead) =>
          lead.ownerId === this.ownerId && lead.taskId === input.taskId &&
          lead.dedupeKey === dedupeKey,
        );
        if (existing) {
          existing.state = existing.contentHash === contentHash
            ? "unchanged" : "changed";
          Object.assign(existing, listing, { contentHash, lastSeenAt: now });
          return existing;
        }
        const lead: BrowserLeadV1 = {
          version: 1, id: uuidV7(), ownerId: this.ownerId,
          taskId: input.taskId, source: input.source,
          sourceKey: input.sourceKey, dedupeKey, ...listing, contentHash,
          firstSeenAt: now, lastSeenAt: now, state: "new",
        };
        state.browserLeads.push(lead);
        return lead;
      });
      for (const lead of state.browserLeads) {
        if (lead.taskId === input.taskId && lead.source === input.source &&
            lead.sourceKey === input.sourceKey && !seen.has(lead.dedupeKey)) {
          lead.state = "closed";
          lead.lastSeenAt = now;
        }
      }
      const cursorHash = canonicalHash(output.map((lead) => ({
        id: lead.externalId, hash: lead.contentHash,
      })) as unknown as JsonValue);
      const cursor = state.jobSourceCursors.find((value) =>
        value.taskId === input.taskId && value.source === input.source &&
        value.sourceKey === input.sourceKey,
      );
      if (cursor) Object.assign(cursor, {
        fetchedAt: now, contentHash: cursorHash, jobCount: output.length,
      });
      else state.jobSourceCursors.push({
        version: 1, ownerId: this.ownerId, taskId: input.taskId,
        source: input.source, sourceKey: input.sourceKey, fetchedAt: now,
        contentHash: cursorHash, jobCount: output.length,
      });
      return output;
    });
  }

  public list(taskId: string, includeClosed = false): Promise<BrowserLeadV1[]> {
    return this.repository.read((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      return state.browserLeads.filter((lead) =>
        lead.taskId === taskId && (includeClosed || lead.state !== "closed"),
      ).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    });
  }

  public evaluate(input: {
    taskId: string;
    runId: string;
    leadId: string;
    score: number;
    shortlisted: boolean;
    rationale: string;
    evidenceRefs?: string[];
  }): Promise<BrowserLeadEvaluationV1> {
    return this.repository.update((state) => {
      const task = requireTask(state.tasks, input.taskId, this.ownerId);
      if (task.activeRunId !== input.runId) throw new Error("Lead evaluation run 不匹配");
      const lead = state.browserLeads.find((value) =>
        value.id === input.leadId && value.taskId === input.taskId);
      if (!lead || lead.state === "closed") throw new Error("BrowserLead 不存在或已关闭");
      if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
        throw new Error("Lead score 必须为 0–100");
      }
      if (input.shortlisted && input.score < 80) {
        throw new Error("低于 80% 的岗位不能进入 Shortlist");
      }
      if (!input.rationale.trim()) throw new Error("Lead evaluation 必须包含理由");
      const evaluation: BrowserLeadEvaluationV1 = {
        version: 1, id: uuidV7(), ownerId: this.ownerId,
        taskId: input.taskId, leadId: input.leadId, runId: input.runId,
        score: input.score, shortlisted: input.shortlisted,
        rationale: input.rationale.trim().slice(0, 4000),
        evidenceRefs: [...new Set(input.evidenceRefs ?? [])],
        createdAt: new Date().toISOString(),
      };
      state.leadEvaluations.push(evaluation);
      return evaluation;
    });
  }

  public latestEvaluations(
    taskId: string,
  ): Promise<BrowserLeadEvaluationV1[]> {
    return this.repository.read((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      const latest = new Map<string, BrowserLeadEvaluationV1>();
      for (const evaluation of state.leadEvaluations) {
        if (evaluation.taskId === taskId) latest.set(evaluation.leadId, evaluation);
      }
      return [...latest.values()];
    });
  }

  public async assertAllOpenLeadsEvaluated(taskId: string): Promise<void> {
    const [leads, evaluations] = await Promise.all([
      this.list(taskId, false),
      this.latestEvaluations(taskId),
    ]);
    const evaluated = new Set(evaluations.map((value) => value.leadId));
    const missing = leads.filter((lead) => !evaluated.has(lead.id));
    if (missing.length > 0) {
      throw new Error(
        `${missing.length} 个当前 BrowserLead 尚未记录匹配分和入选/排除理由`,
      );
    }
  }
}

function normalizeListing(
  value: JobSourceListing,
  company: string,
): JobSourceListing {
  const url = new URL(value.targetUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Job URL 必须为 HTTP(S)");
  return {
    externalId: value.externalId.trim(),
    company: value.company.trim() || company.trim(),
    role: value.role.trim(),
    location: value.location.trim(),
    workplaceType: value.workplaceType?.trim() || null,
    description: value.description.trim().slice(0, 100_000),
    targetUrl: url.toString(),
    sourceUpdatedAt: value.sourceUpdatedAt,
  };
}
