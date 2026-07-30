import type {
  TrackerChildProposal,
  TrackerChildRecord,
  TrackerChildTombstone,
} from "../../../tracker/child-types.js";

type ProposalResult<T extends TrackerChildRecord> = T | TrackerChildTombstone;

export class TrackerProposalRegistry<T extends TrackerChildRecord> {
  readonly #entries = new Map<string, {
    proposal: TrackerChildProposal<T>;
    execute: () => Promise<ProposalResult<T>>;
  }>();
  readonly #executing = new Set<string>();

  public add(
    proposal: TrackerChildProposal<T>,
    execute: () => Promise<ProposalResult<T>>,
  ): TrackerChildProposal<T> {
    const frozen = freezeProposal(proposal);
    this.#entries.set(frozen.id, { proposal: frozen, execute });
    return frozen;
  }

  public async execute(id: string): Promise<ProposalResult<T>> {
    const entry = this.#entries.get(id);
    if (!entry) throw new Error("确认内容不存在或已经失效");
    if (this.#executing.has(id)) throw new Error("这项确认正在执行，请稍候");
    this.#executing.add(id);
    try {
      const result = await entry.execute();
      this.#entries.delete(id);
      return result;
    } finally {
      this.#executing.delete(id);
    }
  }
}

function freezeProposal<T extends TrackerChildRecord>(
  proposal: TrackerChildProposal<T>,
): TrackerChildProposal<T> {
  const clone = structuredClone(proposal);
  if (clone.current) Object.freeze(clone.current);
  if (clone.next) Object.freeze(clone.next);
  return Object.freeze(clone);
}
