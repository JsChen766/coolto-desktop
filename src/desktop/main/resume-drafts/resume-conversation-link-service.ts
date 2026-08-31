import type { ConversationDetail } from "../../shared/types.js";
import type { ConversationStore } from "../conversation-store.js";
import type { ResumeDraftService } from "./resume-draft-service.js";

type ConversationLinks = Pick<
  ConversationStore,
  "create" | "get" | "setActiveResumeArtifact"
>;
type ResumeLinks = Pick<ResumeDraftService, "linkConversation">;

/** Keeps the local Conversation ↔ ResumeDraft navigation link idempotent. */
export class ResumeConversationLinkService {
  public constructor(
    private readonly conversations: ConversationLinks,
    private readonly drafts: ResumeLinks,
  ) {}

  public async link(
    conversationId: string,
    artifactId: string,
  ): Promise<ConversationDetail> {
    await this.conversations.get(conversationId);
    await this.drafts.linkConversation(artifactId, conversationId);
    return this.conversations.setActiveResumeArtifact(
      conversationId,
      artifactId,
    );
  }

  public async create(artifactId: string): Promise<ConversationDetail> {
    const conversation = await this.conversations.create();
    return this.link(conversation.id, artifactId);
  }

  public clear(conversationId: string): Promise<ConversationDetail> {
    return this.conversations.setActiveResumeArtifact(
      conversationId,
      undefined,
    );
  }
}
