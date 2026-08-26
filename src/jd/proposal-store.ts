import { randomUUID } from "node:crypto";

import type { JdProposal, JdProposalRequirement } from "./types.js";
import type { JdSourceKind } from "./source.js";

export class JdProposalStore {
  #active: JdProposal | undefined;

  public create(
    rawText: string,
    title: string,
    company: string | null,
    targetRole: string | null,
    requirements: JdProposalRequirement[],
    source: { kind?: JdSourceKind; url?: string | null } = {},
  ): JdProposal {
    const id = `jd-proposal-${randomUUID()}`;
    this.#active = {
      id,
      rawText,
      title,
      company,
      targetRole,
      sourceKind: source.kind ?? "pasted",
      sourceUrl: source.url ?? null,
      requirements: structuredClone(requirements),
      duplicateStatus: "none",
      createdAt: new Date().toISOString(),
    };
    return structuredClone(this.#active);
  }

  public get(proposalId: string): JdProposal {
    if (!this.#active || this.#active.id !== proposalId) {
      throw new Error("JD Proposal 不存在或已经失效");
    }
    return structuredClone(this.#active);
  }

  public getActive(): JdProposal | undefined {
    return this.#active ? structuredClone(this.#active) : undefined;
  }

  public clear(proposalId: string): void {
    if (this.#active?.id === proposalId) {
      this.#active = undefined;
    }
  }
}
