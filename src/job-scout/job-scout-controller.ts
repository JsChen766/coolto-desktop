import type { AgentHarnessServices } from "../agent-task/agent-harness-services.js";
import type { BrowserLeadV1 } from "../agent-task/browser-lead-types.js";
import { fetchGreenhouseJobs } from "./greenhouse-job-source.js";
import { fetchLeverJobs } from "./lever-job-source.js";

export interface JobScoutLeadView {
  id: string;
  source: BrowserLeadV1["source"];
  sourceKey: string;
  company: string;
  role: string;
  location: string;
  workplaceType: string | null;
  description: string;
  targetUrl: string;
  state: BrowserLeadV1["state"];
  score: number | null;
  shortlisted: boolean;
  rationale: string | null;
}

export class JobScoutController {
  public constructor(
    private readonly conversationId: string,
    private readonly services: AgentHarnessServices,
  ) {}

  public async fetch(input: {
    provider: "greenhouse" | "lever";
    sourceKey: string;
    company: string;
    signal?: AbortSignal;
  }): Promise<JobScoutLeadView[]> {
    const task = await this.#runningTask();
    const active = await this.services.grants.getActive(task.id);
    if (!active.grant || active.revocation) throw new Error("Job Scout grant 不可用");
    const source = requireGrantedSource(
      active.grant.jobCriteria.sources,
      input.provider,
      input.sourceKey,
    );
    const apiDomain = input.provider === "greenhouse"
      ? "boards-api.greenhouse.io" : "api.lever.co";
    if (!active.grant.allowedDomains.some((domain) => matchesDomain(apiDomain, domain))) {
      throw new Error(`Job Scout API domain 未授权：${apiDomain}`);
    }
    const result = input.provider === "greenhouse"
      ? await fetchGreenhouseJobs(
          input.sourceKey, source.company, fetch, input.signal,
        )
      : await fetchLeverJobs(
          input.sourceKey, source.company, fetch, input.signal,
        );
    await this.services.leads.ingest({
      taskId: task.id, source: input.provider, sourceKey: input.sourceKey,
      company: result.company, listings: result.listings,
    });
    return this.list(false);
  }

  public async list(includeClosed: boolean): Promise<JobScoutLeadView[]> {
    const task = await this.#runningTask();
    const leads = await this.services.leads.list(task.id, includeClosed);
    const evaluations = await this.services.leads.latestEvaluations(task.id);
    return leads.map((lead) => {
      const evaluation = evaluations
        .find((value) => value.leadId === lead.id);
      return {
        id: lead.id, source: lead.source, sourceKey: lead.sourceKey,
        company: lead.company, role: lead.role, location: lead.location,
        workplaceType: lead.workplaceType,
        description: lead.description.slice(0, 20_000),
        targetUrl: lead.targetUrl, state: lead.state,
        score: evaluation?.score ?? null,
        shortlisted: evaluation?.shortlisted ?? false,
        rationale: evaluation?.rationale ?? null,
      };
    });
  }

  public async evaluate(input: {
    leadId: string;
    score: number;
    shortlisted: boolean;
    rationale: string;
    evidenceRefs?: string[];
  }) {
    const task = await this.#runningTask();
    return this.services.leads.evaluate({
      taskId: task.id, runId: task.activeRunId!, ...input,
    });
  }

  async #runningTask() {
    const task = await this.services.tasks.findRunningByConversation(
      this.conversationId,
    );
    if (!task?.activeRunId) throw new Error("Job Scout 需要 running AgentTask");
    return task;
  }
}

function requireGrantedSource(
  value: unknown,
  provider: "greenhouse" | "lever",
  sourceKey: string,
): { company: string } {
  if (!Array.isArray(value)) throw new Error("DelegationGrant 未配置 jobCriteria.sources");
  const match = value.find((item) => item && typeof item === "object" &&
    !Array.isArray(item) && item.provider === provider &&
    item.sourceKey === sourceKey);
  if (!match || typeof match !== "object" || Array.isArray(match) ||
      typeof match.company !== "string" || !match.company.trim()) {
    throw new Error(`Job Source 未授权：${provider}/${sourceKey}`);
  }
  return { company: match.company.trim() };
}

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}
