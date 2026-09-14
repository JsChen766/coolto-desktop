import type { AgentContextFactory } from "./agent-context-factory.js";
import type { ConversationAgentContext } from "./agent-runtime-context.js";
import type { ConversationStore } from "./conversation-store.js";
import type { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import type { ResumeProfilePreferenceBinding } from "../../resume/workspace/profile-preference-binding.js";
import { restoreLatestInProgressResume } from "./resume-drafts/resume-conversation-restorer.js";

export class AgentRuntimeContextStore {
  readonly #contexts = new Map<string, ConversationAgentContext>();
  readonly #contextFactory: AgentContextFactory;
  readonly #store: ConversationStore;
  readonly #resumeDrafts: ResumeDraftService;
  readonly #requireCloudBusinessAccess: () => void;

  public constructor(options: {
    contextFactory: AgentContextFactory;
    store: ConversationStore;
    resumeDrafts: ResumeDraftService;
    requireCloudBusinessAccess?(): void;
  }) {
    this.#contextFactory = options.contextFactory;
    this.#store = options.store;
    this.#resumeDrafts = options.resumeDrafts;
    this.#requireCloudBusinessAccess = options.requireCloudBusinessAccess ?? (() => undefined);
  }

  public get(conversationId: string): ConversationAgentContext | undefined {
    return this.#contexts.get(conversationId);
  }

  public async load(conversationId: string): Promise<ConversationAgentContext> {
    this.#requireCloudBusinessAccess();
    const existing = this.#contexts.get(conversationId);
    if (existing) return existing;
    const context = this.#contextFactory.create(conversationId);
    const [messages, detail] = await Promise.all([
      this.#store.loadMessages(conversationId),
      this.#store.get(conversationId),
    ]);
    context.agent.replaceMessages(messages);
    await restoreLatestInProgressResume(
      detail.resumeArtifacts,
      this.#resumeDrafts,
      {
        ...context,
        profilePreferenceContext: () => readProfilePreferenceBinding(context),
      },
    ).catch(() => false);
    await context.refreshProfilePreferenceContext?.();
    this.#contexts.set(conversationId, context);
    return context;
  }
}

async function readProfilePreferenceBinding(
  context: ConversationAgentContext,
): Promise<ResumeProfilePreferenceBinding> {
  const authority = context.refreshProfilePreferenceContext
    ? await context.refreshProfilePreferenceContext()
    : context.profilePreferenceAuthority;
  if (!authority) throw new Error("Profile/Preference context unavailable");
  return {
    profileEntityVersion: authority.profileVersion,
    ...(authority.profileLocalVersion === undefined ? {} : {
      profileLocalVersion: authority.profileLocalVersion,
    }),
    targetFingerprint: authority.targetFingerprint,
    preferenceResolutionHash: authority.resolutionHash,
    explainability: {
      appliedKeys: authority.resolution.applied.map((item) => item.key),
      overriddenCount: authority.resolution.overridden.length,
      conflictCount: authority.resolution.conflicts.length,
    },
  };
}
