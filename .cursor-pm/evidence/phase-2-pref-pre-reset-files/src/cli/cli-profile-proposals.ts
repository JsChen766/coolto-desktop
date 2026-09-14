import type { CooltoApiClient } from "../api/coolto-api-client.js";
import type {
  ProfileChangeSet,
  ProfileProposalExecutor,
  ProfileWriteProposal,
} from "../profile/types.js";
import { mergeProfile } from "../desktop/main/profile/profile-sync-mapping.js";
import { pushProfileUpdate, cliDeviceId } from "./cli-profile-writer.js";

interface PendingProposal {
  proposal: ProfileWriteProposal;
  expectedVersion: number;
}

export function createCliProfileProposalExecutor(
  client: CooltoApiClient,
  sessionDeviceId?: string,
): ProfileProposalExecutor {
  const pending = new Map<string, PendingProposal>();


  async function prepare(
    current: ProfileWriteProposal["current"],
    changes: ProfileChangeSet,
    kind: ProfileWriteProposal["kind"],
  ): Promise<ProfileWriteProposal> {
    const currentUser = await client.getCurrentUser();
    const id = currentUser.deviceId ?? sessionDeviceId ?? await cliDeviceId();
    const expectedVersion = current.entityVersion ?? (
      (await client.sync.bootstrap(id)).changes.find(
        (change) => change.entityType === "user_profile",
      )?.entityVersion ?? 0
    );
    const proposal: ProfileWriteProposal = {
      id: `profile-cli-${Date.now()}-${pending.size}`,
      kind, current: structuredClone(current),
      next: structuredClone(mergeProfile(current, changes)),
      syncStatus: "clean", preparedAt: new Date().toISOString(),
    };
    pending.set(proposal.id, { proposal, expectedVersion });
    return proposal;
  }

  return {
    prepareImport: async (changes, expected) => {
      const current = await client.getUserProfile();
      for (const field of expected) {
        if (current[field.field] !== field.currentValue) {
          throw new Error("个人资料已变化，请重新解析附件后确认");
        }
      }
      return prepare(current, changes, "import");
    },
    prepareUpdate: async (changes) => prepare(
      await client.getUserProfile(), changes, "manual",
    ),
    prepareReapply: async (changes) => prepare(
      await client.getUserProfile(), changes, "reapply",
    ),
    prepareAcceptServer: async () => {
      const current = await client.getUserProfile();
      const currentUser = await client.getCurrentUser();
      const id = currentUser.deviceId ?? sessionDeviceId ?? await cliDeviceId();
      const expectedVersion = current.entityVersion ?? (
        (await client.sync.bootstrap(id)).changes.find(
          (change) => change.entityType === "user_profile",
        )?.entityVersion ?? 0
      );
      const proposal: ProfileWriteProposal = {
        id: `profile-cli-${Date.now()}-${pending.size}`,
        kind: "accept_server", current: structuredClone(current), next: null,
        syncStatus: "clean", preparedAt: new Date().toISOString(),
      };
      pending.set(proposal.id, { proposal, expectedVersion });
      return proposal;
    },
    execute: async (id) => {
      const entry = pending.get(id);
      if (!entry) throw new Error("个人资料确认不存在或已失效");
      pending.delete(id);
      if (!entry.proposal.next) return null;
      await pushProfileUpdate(
        client, entry.proposal.next, sessionDeviceId, entry.expectedVersion,
      );
      return entry.proposal.next;
    },
  };
}
