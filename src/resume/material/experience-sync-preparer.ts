import type { ExperienceWriteProposal } from "../../experience/maintenance-types.js";
import type { ResumeWorkspace } from "../workspace/types.js";
import type { ResumeExperienceSyncProposalPort } from "./experience-sync-port.js";

export async function prepareExperienceSyncProposals(
  workspace: ResumeWorkspace,
  proposals: ResumeExperienceSyncProposalPort,
  selectedExperienceIds?: readonly string[],
): Promise<ExperienceWriteProposal[]> {
  const availableIds = [...new Set(
    (workspace.supplementalEvidence ?? []).map((item) => item.experienceId),
  )];
  const ids = selectedExperienceIds
    ? [...new Set(selectedExperienceIds.map((id) => id.trim()))]
    : availableIds;
  if (!ids.length || ids.some((id) => !id)) {
    throw new Error("当前简历没有可同步的用户补充事实");
  }
  if (selectedExperienceIds && ids.length !== selectedExperienceIds.length) {
    throw new Error("experienceIds 含重复或空值");
  }
  const prepared: ExperienceWriteProposal[] = [];
  try {
    for (const id of ids) {
      const source = workspace.sourceSnapshot.experiences.find(
        (item) => item.id === id,
      );
      if (!source) throw new Error(`经历 ${id} 不在当前工作区`);
      const facts = (workspace.supplementalEvidence ?? [])
        .filter((item) => item.experienceId === id)
        .map((item) => item.text)
        .filter((fact) => !source.content.includes(fact));
      if (!facts.length) continue;
      const proposal = await proposals.prepareUpdate(id, {
        content: [source.content.trimEnd(), ...facts].join("\n"),
      });
      if (proposal.current?.content !== source.content) {
        proposals.discard(proposal.id);
        throw new Error(`经历 ${id} 已变化，请重新生成工作区后再同步`);
      }
      prepared.push(proposal);
    }
  } catch (error) {
    prepared.forEach((proposal) => proposals.discard(proposal.id));
    throw error;
  }
  if (!prepared.length) throw new Error("当前简历没有待同步的新事实");
  return prepared;
}
