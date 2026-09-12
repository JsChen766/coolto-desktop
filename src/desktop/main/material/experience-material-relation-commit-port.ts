import type { ExperienceProposalService } from "../experience-library/experience-proposal-service.js";
import type {
  MaterialRelationCommitInput,
  MaterialRelationCommitPort,
} from "../../../material/material-proposal-service.js";

interface ExperienceEntityReader {
  getEntity(
    type: "experience",
    id: string,
  ): { payload: { content?: unknown } } | undefined;
}

export function createExperienceMaterialRelationCommitPort(
  experienceProposals: ExperienceProposalService,
  entities: ExperienceEntityReader,
): MaterialRelationCommitPort {
  const preparedByKey = new Map<string, { proposalId: string; experienceId?: string }>();
  return {
    prepare: async (input: MaterialRelationCommitInput) => {
      const existing = preparedByKey.get(input.idempotencyKey);
      if (existing) return existing;
      const entity = entities.getEntity("experience", input.experienceId);
      if (!entity) throw new Error(`target Experience missing: ${input.experienceId}`);
      const currentContent = typeof entity.payload.content === "string"
        ? entity.payload.content
        : "";
      const citation = JSON.stringify(input.citations[0] ?? null);
      const proposal = await experienceProposals.prepareUpdate(input.experienceId, {
        content: `${currentContent}\n\n【材料引用】${input.proposal.materialId}\n${citation}`,
        revisionSource: "import",
      });
      const receipt = { proposalId: proposal.id, experienceId: input.experienceId };
      preparedByKey.set(input.idempotencyKey, receipt);
      return receipt;
    },
    executeMany: async (proposalIds) => experienceProposals.executeMany(proposalIds),
    discard: (proposalId) => { experienceProposals.discard(proposalId); },
  };
}
