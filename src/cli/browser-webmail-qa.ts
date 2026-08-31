import { AgentHarnessServices } from "../agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../agent-task/agent-harness-state-repository.js";
import type { AgentEvidenceStore, AgentEvidenceV1 } from "../agent-task/evidence-types.js";
import type { BrowserAgentController } from "../browser/agent-control-types.js";
import { InboxSignalController } from "../inbox-signals/inbox-signal-controller.js";

export async function runBrowserWebmailQa(input: {
  browser: BrowserAgentController;
  allowedDomain: string;
  capture?: BrowserWebmailQaCapture;
  sitePolicyAllows?: (origin: string | null, toolName: string) => boolean;
}): Promise<{ dedupeCount: number; provider: string; bodyVerified: boolean }> {
  const ownerId = "browser-webmail-qa";
  const evidence = new MemoryEvidenceStore(ownerId);
  const harness = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()),
    evidence,
  );
  const task = await harness.tasks.create("browser-webmail-qa", "Track webmail");
  const now = Date.now();
  await harness.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: [input.allowedDomain], blockedDomains: [],
    allowedActions: ["browser.read", "mail.read", "mail.classify", "task.lifecycle"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {},
    connectorPolicy: { browserWebmail: true }, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be5-qa",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  await harness.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const controller = new InboxSignalController(
    "browser-webmail-qa", harness,
    { get: async () => { throw new Error("API connector must not be used"); } },
    [], { getApplication: async (id) => ({ id }) }, input.browser,
    input.sitePolicyAllows ?? (() => true),
  );
  const capture = input.capture ?? {
    direction: "received", directionEvidence: "Inbox",
    sender: "recruiter@example.com", subject: "Interview invitation",
    receivedAt: "2026-08-22T10:00:00.000Z", receivedAtEvidence: "Aug 22, 10:00",
    bodyText: "Your interview is scheduled for Monday at 10:00 HKT.",
  };
  const first = await controller.captureBrowser(capture);
  const second = await controller.captureBrowser(capture);
  const message = await controller.readEvent(first.eventId);
  await controller.record({
    eventId: first.eventId, kind: "interview_invite", confidence: 95,
    applicationId: null, rationale: "Explicit interview invitation",
    evidenceQuotes: ["interview is scheduled"],
  });
  return {
    dedupeCount: (await harness.events.all(task.id)).length,
    provider: second.provider,
    bodyVerified: message.bodyText === capture.bodyText,
  };
}

export interface BrowserWebmailQaCapture {
  direction: "received" | "sent";
  directionEvidence: string;
  sender: string;
  subject: string;
  receivedAt: string;
  receivedAtEvidence: string;
  bodyText: string;
}

class MemoryEvidenceStore implements AgentEvidenceStore {
  readonly #values = new Map<string, AgentEvidenceV1>();
  public constructor(private readonly ownerId: string) {}
  public async save(input: Omit<AgentEvidenceV1, "version" | "id" | "ownerId">) {
    const value: AgentEvidenceV1 = {
      version: 1, id: `00000000-0000-7000-8000-${String(this.#values.size).padStart(12, "0")}`,
      ownerId: this.ownerId, ...structuredClone(input),
    };
    this.#values.set(value.id, value); return structuredClone(value);
  }
  public async read(id: string) {
    const value = this.#values.get(id); return value ? structuredClone(value) : undefined;
  }
  public async clearExpired() { return 0; }
  public async clearAll() { this.#values.clear(); }
}
