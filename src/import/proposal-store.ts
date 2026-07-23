import { randomUUID } from "node:crypto";

import type { ExperienceCreateInput } from "../api/types.js";
import type {
  CandidateDuplicateMatch,
  ExperienceImportProposal,
} from "./types.js";
import { normalizeImportCandidate } from "./validation.js";

export class ExperienceImportProposalStore {
  #active: ExperienceImportProposal | undefined;

  public create(
    sourceType: "text" | "file",
    inputs: ExperienceCreateInput[],
    duplicateMatches: CandidateDuplicateMatch[],
    sourceLabel?: string,
  ): ExperienceImportProposal {
    const id = `import-${randomUUID()}`;
    const duplicateByIndex = new Map(
      duplicateMatches.map((match) => [
        match.candidateIndex,
        match.existing,
      ]),
    );
    const candidates = inputs.map((input, index) => {
      const duplicateOf = duplicateByIndex.get(index);
      return {
        candidate: normalizeImportCandidate(
          input,
          `candidate-${index + 1}`,
        ),
        selected: duplicateOf === undefined,
        ...(duplicateOf ? { duplicateOf } : {}),
      };
    });

    this.#active = {
      id,
      sourceType,
      ...(sourceLabel ? { sourceLabel } : {}),
      candidates,
      createdAt: new Date().toISOString(),
    };
    return structuredClone(this.#active);
  }

  public get(proposalId: string): ExperienceImportProposal {
    if (!this.#active || this.#active.id !== proposalId) {
      throw new Error("导入 Proposal 不存在或已经失效");
    }
    return structuredClone(this.#active);
  }

  public getActive(): ExperienceImportProposal | undefined {
    return this.#active ? structuredClone(this.#active) : undefined;
  }

  public markSaved(
    proposalId: string,
    clientId: string,
    experienceId: string,
  ): void {
    const proposal = this.requireActive(proposalId);
    const proposed = proposal.candidates.find(
      ({ candidate }) => candidate.clientId === clientId,
    );
    if (!proposed) {
      throw new Error(`找不到候选经历：${clientId}`);
    }
    proposed.savedExperienceId = experienceId;
  }

  public clear(proposalId: string): void {
    if (this.#active?.id === proposalId) {
      this.#active = undefined;
    }
  }

  private requireActive(proposalId: string): ExperienceImportProposal {
    if (!this.#active || this.#active.id !== proposalId) {
      throw new Error("导入 Proposal 不存在或已经失效");
    }
    return this.#active;
  }
}
