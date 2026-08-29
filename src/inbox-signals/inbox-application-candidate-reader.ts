import type { AgentHarnessServices } from "../agent-task/agent-harness-services.js";
import type {
  ApplicationListOptions,
  ApplicationListResult,
  ApplicationRecord,
} from "../tracker/types.js";
import { requireInboxTaskAccess } from "./inbox-task-access.js";

interface ApplicationSource {
  listApplications(options: ApplicationListOptions): Promise<ApplicationListResult>;
  getApplication(id: string): Promise<ApplicationRecord>;
}

export interface ApplicationCandidate {
  applicationRef: string;
  companyName: string;
  roleName: string;
  jdTitleSnapshot: string | null;
  status: ApplicationRecord["status"];
  appliedAt: string | null;
  pendingConfirmation: boolean;
  deliveryMethod: ApplicationRecord["deliveryMethod"];
  source: ApplicationRecord["source"];
  syncStatus: "clean" | "pending";
}

interface IssuedCandidate {
  applicationId: string;
  entityVersion: number;
}

export class InboxApplicationCandidateReader {
  readonly #issuedByEvent = new Map<string, Map<string, IssuedCandidate>>();
  readonly #refByEventId = new Map<string, Map<string, string>>();
  #nextReference = 1;

  public constructor(
    private readonly conversationId: string,
    private readonly harness: AgentHarnessServices,
    private readonly applications: ApplicationSource,
  ) {}

  public async search(input: {
    eventId: string;
    query?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    eventId: string;
    items: ApplicationCandidate[];
    nextCursor: string | null;
    excludedCount: number;
  }> {
    const active = await requireInboxTaskAccess(
      this.conversationId, this.harness, "tracker.application.read",
    );
    await this.#requireMailEvent(active.task.id, input.eventId);
    const page = await this.applications.listApplications({
      ...(input.query ? { query: input.query } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
      limit: input.limit ?? 10,
    });
    const eligible = page.items.filter(isEligible);
    return {
      eventId: input.eventId,
      items: eligible.map((item) => this.#issue(input.eventId, item)),
      nextCursor: page.nextCursor,
      excludedCount: page.items.length - eligible.length,
    };
  }

  public async resolve(eventId: string, reference: string): Promise<string> {
    const active = await requireInboxTaskAccess(
      this.conversationId, this.harness, "tracker.application.read",
    );
    await this.#requireMailEvent(active.task.id, eventId);
    const issued = this.#issuedByEvent.get(eventId)?.get(reference);
    if (!issued) throw new Error("Application 引用必须来自当前邮件的候选读取");
    const current = await this.applications.getApplication(issued.applicationId);
    if (current.entityVersion !== issued.entityVersion || !isEligible(current)) {
      throw new Error("Application 候选已变化，请重新读取后再关联");
    }
    return current.id;
  }

  public referenceFor(eventId: string, applicationId: string): string | null {
    return this.#refByEventId.get(eventId)?.get(applicationId) ?? null;
  }

  async #requireMailEvent(taskId: string, eventId: string): Promise<void> {
    const event = await this.harness.events.get(taskId, eventId);
    if (event.source !== "mail" || !event.payloadRef) {
      throw new Error("Application 候选只能关联当前任务的邮件事件");
    }
  }

  #issue(
    eventId: string,
    value: ApplicationRecord & { syncStatus: "clean" | "pending" },
  ): ApplicationCandidate {
    let references = this.#refByEventId.get(eventId);
    if (!references) {
      references = new Map();
      this.#refByEventId.set(eventId, references);
    }
    let reference = references.get(value.id);
    if (!reference) {
      reference = `app_${this.#nextReference++}`;
      references.set(value.id, reference);
    }
    let issued = this.#issuedByEvent.get(eventId);
    if (!issued) {
      issued = new Map();
      this.#issuedByEvent.set(eventId, issued);
    }
    issued.set(reference, {
      applicationId: value.id,
      entityVersion: value.entityVersion,
    });
    return projectCandidate(reference, value);
  }
}

function isEligible(value: ApplicationRecord): value is ApplicationRecord & {
  syncStatus: "clean" | "pending";
} {
  return !value.deletedAt && ["clean", "pending"].includes(value.syncStatus);
}

function projectCandidate(
  applicationRef: string,
  value: ApplicationRecord & { syncStatus: "clean" | "pending" },
): ApplicationCandidate {
  return {
    applicationRef,
    companyName: value.companyName,
    roleName: value.roleName,
    jdTitleSnapshot: value.jdTitleSnapshot,
    status: value.status,
    appliedAt: value.appliedAt,
    pendingConfirmation: value.pendingConfirmation,
    deliveryMethod: value.deliveryMethod,
    source: value.source,
    syncStatus: value.syncStatus,
  };
}
