import type { CooltoApiClient } from "../api/coolto-api-client.js";
import type {
  ProfileProposalExecutor,
  ProfileWriteProposal,
} from "../profile/types.js";
import type { ResumeContactFields } from "../resume/contracts/profile-contact.js";
import { pushProfileUpdate } from "./cli-profile-writer.js";

const CONTACT_FIELDS: readonly (keyof ResumeContactFields)[] = [
  "fullName",
  "phone",
  "contactEmail",
  "location",
  "linkedinUrl",
  "githubUrl",
  "personalWebsite",
];

/**
 * CLI profile proposal executor backed by the real sync protocol: prepares
 * an import proposal (validating the expected fields against the server
 * profile) and executes it by pushing a user_profile/update operation
 * through /v1/sync/push.
 */
export function createCliProfileProposalExecutor(
  client: CooltoApiClient,
  sessionDeviceId?: string,
): ProfileProposalExecutor {
  const pending = new Map<string, ProfileWriteProposal>();

  return {
    async prepareImport(changes, expected) {
      const current = await client.getUserProfile();
      for (const field of expected) {
        if (current[field.field] !== field.currentValue) {
          throw new Error("个人资料已变化，请重新解析附件后确认");
        }
      }
      const proposal: ProfileWriteProposal = {
        id: `profile-cli-${Date.now()}`,
        kind: "import",
        current: pickContact(current),
        next: { ...pickContact(current), ...changes },
        syncStatus: "clean",
        preparedAt: new Date().toISOString(),
      };
      pending.set(proposal.id, proposal);
      return proposal;
    },
    async execute(id) {
      const proposal = pending.get(id);
      if (!proposal) throw new Error("个人资料确认不存在或已失效");
      pending.delete(id);
      if (!proposal.next) return null;
      await pushProfileUpdate(
        client,
        { ...(await client.getUserProfile()), ...proposal.next },
        sessionDeviceId,
      );
      return null;
    },
  };
}

function pickContact(
  profile: Awaited<ReturnType<CooltoApiClient["getUserProfile"]>>,
): ResumeContactFields {
  const contact: ResumeContactFields = {
    fullName: null,
    phone: null,
    contactEmail: null,
    location: null,
    linkedinUrl: null,
    githubUrl: null,
    personalWebsite: null,
  };
  for (const field of CONTACT_FIELDS) {
    contact[field] = profile[field] ?? null;
  }
  return contact;
}
