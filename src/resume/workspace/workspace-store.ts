import type { ResumeWorkspace } from "./types.js";
import { ResumeWorkspaceError } from "./errors.js";

export class ResumeWorkspaceStore {
  readonly #workspaces = new Map<string, ResumeWorkspace>();

  public create(workspace: ResumeWorkspace): ResumeWorkspace {
    if (this.#workspaces.has(workspace.candidateId)) {
      throw new Error(`Duplicate candidate ID: ${workspace.candidateId}`);
    }
    this.#workspaces.set(workspace.candidateId, structuredClone(workspace));
    return structuredClone(workspace);
  }

  public get(candidateId: string): ResumeWorkspace {
    const workspace = this.#workspaces.get(candidateId.trim());
    if (!workspace) {
      throw new ResumeWorkspaceError(
        "candidate_not_found",
        `Resume candidate ${candidateId} does not exist in this task.`,
      );
    }
    return structuredClone(workspace);
  }

  public replace(
    workspace: ResumeWorkspace,
    expectedRevision: number,
  ): ResumeWorkspace {
    const current = this.#workspaces.get(workspace.candidateId);
    if (!current) {
      throw new ResumeWorkspaceError(
        "candidate_not_found",
        `Resume candidate ${workspace.candidateId} does not exist in this task.`,
      );
    }
    if (current.revision !== expectedRevision) {
      throw new ResumeWorkspaceError(
        "stale_candidate_revision",
        `Candidate revision changed from ${expectedRevision} to ${current.revision}.`,
      );
    }
    this.#workspaces.set(workspace.candidateId, structuredClone(workspace));
    return structuredClone(workspace);
  }
}
