import type {
  ResumeDraftDetail,
  ResumeDraftEditInput,
  ResumeDraftRestoreInput,
} from "../../shared/types.js";
import { updateDraftWorkspace } from "../../../resume/draft/projection.js";
import { ResumeManualEditor } from "../../../resume/draft/manual-editor.js";
import { ResumeDraftService } from "./resume-draft-service.js";
import { toResumeDraftDetail } from "./draft-view.js";

export class ResumeDraftEditingService {
  public constructor(
    private readonly drafts: ResumeDraftService,
    private readonly editor: ResumeManualEditor,
  ) {}

  public async get(artifactId: string): Promise<ResumeDraftDetail> {
    return toResumeDraftDetail(await this.drafts.get(artifactId));
  }

  public async edit(input: ResumeDraftEditInput): Promise<ResumeDraftDetail> {
    const current = await this.drafts.get(input.artifactId);
    if (current.pendingChange) {
      throw new Error("请先接受或拒绝当前 AI 修改");
    }
    const workspace = await this.editor.edit(
      current.workspace,
      input.target,
      input.text,
    );
    const updated = updateDraftWorkspace(
      current,
      requireConversationId(current.conversationIds),
      workspace,
    );
    await this.drafts.save(updated);
    if (input.createCheckpoint === false) {
      return toResumeDraftDetail(updated);
    }
    return toResumeDraftDetail(
      await this.drafts.checkpoint(
        updated.artifactId,
        "manual_edit",
        "手动修改",
      ),
    );
  }

  public async restore(
    input: ResumeDraftRestoreInput,
  ): Promise<ResumeDraftDetail> {
    const current = await this.drafts.get(input.artifactId);
    const checkpoint = current.checkpoints.find(
      (candidate) => candidate.id === input.checkpointId,
    );
    if (!checkpoint) throw new Error("本地简历版本不存在");
    const restoredWorkspace = {
      ...structuredClone(checkpoint.workspace),
      revision: current.workspace.revision + 1,
    };
    const updated = {
      ...updateDraftWorkspace(
        current,
        requireConversationId(current.conversationIds),
        restoredWorkspace,
      ),
      pendingChange: null,
    };
    await this.drafts.save(updated);
    return toResumeDraftDetail(
      await this.drafts.checkpoint(
        updated.artifactId,
        "restored",
        `恢复：${checkpoint.label}`,
      ),
    );
  }

  public async accept(artifactId: string): Promise<ResumeDraftDetail> {
    return toResumeDraftDetail(
      await this.drafts.acceptPendingChange(artifactId),
    );
  }

  public async reject(artifactId: string): Promise<ResumeDraftDetail> {
    return toResumeDraftDetail(
      await this.drafts.rejectPendingChange(artifactId),
    );
  }
}

function requireConversationId(values: string[]): string {
  const conversationId = values[0];
  if (!conversationId) throw new Error("本地简历缺少关联对话");
  return conversationId;
}
