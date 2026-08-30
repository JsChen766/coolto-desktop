import type { ExperienceReader } from "../../../api/types.js";
import type {
  ExperienceMaterialCommitInput,
  ExperienceMaterialCommitResult,
  ExperienceMaterialCommitter,
} from "../../../experience/material-ingestion-types.js";
import type {
  ExperienceCreateInput,
  ExperienceUpdateInput,
} from "../../../api/types.js";
import type {
  ExperienceExecutionResult,
  ExperienceWriteProposal,
} from "../../../experience/maintenance-types.js";

export class LocalExperienceMaterialCommitter
implements ExperienceMaterialCommitter {
  public constructor(
    private readonly experiences: ExperienceReader,
    private readonly proposals: ExperienceMaterialProposalPort,
  ) {}

  public async commit(
    input: ExperienceMaterialCommitInput,
  ): Promise<ExperienceMaterialCommitResult> {
    const block = materialBlock(input);
    if (input.target.kind === "new") {
      const proposal = await this.proposals.prepareCreate({
        category: input.target.category,
        title: input.target.title,
        content: block,
        ...(input.target.organization ? { organization: input.target.organization } : {}),
        ...(input.target.role ? { role: input.target.role } : {}),
        ...(input.target.location ? { location: input.target.location } : {}),
        ...(input.target.startDate ? { startDate: input.target.startDate } : {}),
        ...(input.target.endDate ? { endDate: input.target.endDate } : {}),
        tags: input.target.tags,
        revisionSource: "import",
      });
      const result = this.proposals.execute(proposal.id);
      if (!result.experience) throw new Error("材料经历本地创建失败");
      return response(result.experience.id, result.experience.title, true, false, block, input);
    }

    const current = await this.experiences.getExperience(input.target.experienceId);
    const content = current.currentRevision?.content ?? "";
    if (content.includes(materialMarker(input.sourceHash))) {
      return response(current.id, current.title, false, true, "", input);
    }
    const merged = mergeContent(content, block);
    const proposal = await this.proposals.prepareUpdate(current.id, {
      content: merged,
      revisionSource: "import",
    });
    if (proposal.current?.content !== content) {
      this.proposals.discard(proposal.id);
      throw new Error("经历正文已变化，请重新读取后再沉淀材料");
    }
    const result = this.proposals.execute(proposal.id);
    if (!result.experience) throw new Error("材料经历本地更新失败");
    return response(current.id, current.title, false, false, block, input);
  }
}

export interface ExperienceMaterialProposalPort {
  prepareCreate(input: ExperienceCreateInput): Promise<ExperienceWriteProposal>;
  prepareUpdate(
    experienceId: string,
    changes: ExperienceUpdateInput,
  ): Promise<ExperienceWriteProposal>;
  execute(proposalId: string): ExperienceExecutionResult;
  discard(proposalId: string): void;
}

function materialBlock(input: ExperienceMaterialCommitInput): string {
  const date = input.capturedAt.slice(0, 10);
  const sections = input.sections
    .map((section) => `【${section.label}】\n${section.text.trim()}`)
    .join("\n\n");
  return [
    `【材料沉淀：${input.sourceLabel}｜${date}】`,
    sections,
    materialMarker(input.sourceHash),
  ].join("\n\n");
}

function materialMarker(hash: string): string {
  return `【材料指纹：${hash}】`;
}

function mergeContent(current: string, block: string): string {
  const existing = new Set(current.split("\n").map(normalized).filter(Boolean));
  const lines = block.split("\n").filter((line) => {
    const value = normalized(line);
    if (!value || !existing.has(value)) return true;
    return line.startsWith("【");
  });
  return [current.trimEnd(), lines.join("\n").trim()].filter(Boolean).join("\n\n");
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function response(
  experienceId: string,
  title: string,
  created: boolean,
  duplicate: boolean,
  added: string,
  input: ExperienceMaterialCommitInput,
): ExperienceMaterialCommitResult {
  return {
    experienceId, title, created, duplicate,
    addedCharacters: added.length,
    sectionCount: input.sections.length,
    numberCount: input.numberCount,
    criticalOutputCount: input.criticalOutputCount,
  };
}
