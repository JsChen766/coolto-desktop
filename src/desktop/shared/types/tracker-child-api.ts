import type {
  TrackerChildProposal,
  TrackerChildTombstone,
} from "../../../tracker/child-types.js";

export interface TrackerChildDesktopApi<T, I> {
  prepareCreate(input: { applicationId: string; value: I }): Promise<TrackerChildProposal>;
  prepareUpdate(input: { id: string; value: I }): Promise<TrackerChildProposal>;
  prepareDelete(id: string): Promise<TrackerChildProposal>;
  executeProposal(proposalId: string): Promise<T | TrackerChildTombstone>;
}
