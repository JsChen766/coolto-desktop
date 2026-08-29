import type { AgentHarnessServices } from "../agent-task/agent-harness-services.js";
import { canonicalHash } from "../agent-task/canonical-hash.js";
import type { JsonValue } from "../agent-task/json-types.js";
import type { AgentTaskV1 } from "../agent-task/task-types.js";
import type {
  ExternalSignalKind,
  ExternalSignalV1,
  InboxIncrementalAdapter,
  InboxMessagePayloadV1,
  MailConnectionRegistry,
} from "./inbox-signal-types.js";
import { mailSecurityFlags } from "./mail-security.js";
import type { BrowserAgentController } from "../browser/agent-control-types.js";
import { boundedMailText } from "./mail-text.js";
import { requireInboxTaskAccess } from "./inbox-task-access.js";

export interface InboxApplicationReader {
  getApplication(id: string): Promise<{ id: string }>;
}

export class InboxSignalController {
  readonly #adapters: Map<string, InboxIncrementalAdapter>;

  public constructor(
    private readonly conversationId: string,
    private readonly harness: AgentHarnessServices,
    private readonly connections: MailConnectionRegistry,
    adapters: InboxIncrementalAdapter[],
    private readonly applications: InboxApplicationReader,
    private readonly browser?: BrowserAgentController,
    private readonly sitePolicyAllows?: (
      origin: string | null,
      toolName: string,
    ) => boolean,
  ) {
    this.#adapters = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
  }

  public async captureBrowser(input: {
    sender: string; subject: string; receivedAt: string;
    receivedAtEvidence: string; bodyText: string;
  }): Promise<{
    eventId: string; provider: string; sender: string; subject: string;
    receivedAt: string; sourceMessageHash: string; securityFlags: string[];
  }> {
    const active = await requireInboxTaskAccess(
      this.conversationId, this.harness, "mail.read",
    );
    if (active.grant.connectorPolicy?.browserWebmail !== true) {
      throw new Error("DelegationGrant 未授权 Browser Webmail");
    }
    if (!this.browser) throw new Error("浏览器 Webmail Source 不可用");
    const observation = await this.browser.snapshot(false);
    const url = observation.tab.url ? new URL(observation.tab.url) : null;
    if (!url || !["http:", "https:"].includes(url.protocol) ||
        !matchesAllowedDomain(url.hostname, active.grant.allowedDomains)) {
      throw new Error("当前 Webmail 页面不在授权 domain");
    }
    if (!this.sitePolicyAllows?.(url.origin, "capture_browser_mail_event")) {
      throw new Error("当前 Webmail Site Policy 尚未通过或不允许 capture");
    }
    const sender = input.sender.trim();
    const subject = input.subject.trim();
    const timeEvidence = input.receivedAtEvidence.trim();
    const bodyText = boundedMailText(input.bodyText);
    const pageText = observation.page.text;
    if (!sender || !subject || !timeEvidence || !bodyText ||
        ![sender, subject, timeEvidence, bodyText].every((value) => pageText.includes(value))) {
      throw new Error("Webmail sender/subject/time/body 必须逐字来自当前页面");
    }
    const receivedAt = new Date(input.receivedAt).toISOString();
    const identity = canonicalHash({
      origin: url.origin, url: url.toString(), sender, subject,
      receivedAtEvidence: timeEvidence, bodyText,
    } as JsonValue);
    const message: InboxMessagePayloadV1 = {
      version: 1, provider: "browser_webmail",
      connectionId: `browser:${url.origin}`, sourceMessageId: identity,
      internetMessageId: null, sender, subject, receivedAt, bodyText,
      securityFlags: mailSecurityFlags(`${subject}\n${bodyText}`),
    };
    return this.#ingest(active.task, message,
      `mail:browser_webmail:${url.origin}:${identity}`);
  }

  public async fetch(input: {
    connectionId: string;
    maxResults?: number;
  }): Promise<Array<{
    eventId: string; provider: string; sender: string;
    subject: string; receivedAt: string; sourceMessageHash: string;
    securityFlags: string[];
  }>> {
    const active = await requireInboxTaskAccess(
      this.conversationId, this.harness, "mail.read",
    );
    const connection = await this.connections.get(input.connectionId);
    requireSelectedConnection(active.grant.connectorPolicy, connection.id);
    const adapter = this.#adapters.get(connection.provider);
    if (!adapter) throw new Error(`邮箱 Provider 尚未支持：${connection.provider}`);
    if (!this.harness.evidence) throw new Error("加密 Connector evidence store 不可用");
    const maxResults = input.maxResults ?? 25;
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50) {
      throw new Error("maxResults 必须是 1–50 整数");
    }
    const cursor = await this.harness.signals.cursor(
      active.task.id, connection.provider, connection.id,
    );
    const page = await adapter.fetch({ connection, cursor, maxResults });
    const summaries = [];
    for (const message of page.messages) {
      const securedMessage: InboxMessagePayloadV1 = {
        ...message,
        securityFlags: mailSecurityFlags(`${message.subject}\n${message.bodyText}`),
      };
      const dedupeKey = `mail:${connection.provider}:${connection.id}:${message.sourceMessageId}`;
      summaries.push(await this.#ingest(active.task, securedMessage, dedupeKey));
    }
    await this.harness.signals.saveCursor({
      taskId: active.task.id, provider: connection.provider,
      connectionId: connection.id, cursor: page.cursor,
      updatedAt: new Date().toISOString(),
    });
    return summaries;
  }

  public async readEvent(eventId: string): Promise<InboxMessagePayloadV1> {
    const active = await requireInboxTaskAccess(
      this.conversationId, this.harness, "mail.read",
    );
    const event = await this.harness.events.get(active.task.id, eventId);
    if (event.source !== "mail" || !event.payloadRef) throw new Error("Mail event payload 不可用");
    const evidence = await this.harness.evidence?.read(event.payloadRef);
    if (!evidence || evidence.kind !== "connector_payload" ||
        evidence.payloadHash !== event.payloadHash) {
      throw new Error("邮件原始 evidence 已过期或 hash 不匹配");
    }
    return readPayload(evidence.payload);
  }

  public async record(input: {
    eventId: string; kind: ExternalSignalKind; confidence: number;
    applicationId?: string | null; rationale: string; evidenceQuotes: string[];
  }): Promise<ExternalSignalV1> {
    const active = await requireInboxTaskAccess(
      this.conversationId, this.harness, "mail.classify",
    );
    const message = await this.readEvent(input.eventId);
    const applicationId = input.applicationId ?? null;
    if (applicationId) await this.applications.getApplication(applicationId);
    assertEvidenceQuotes(message, input.evidenceQuotes);
    return this.harness.signals.record({
      taskId: active.task.id, eventId: input.eventId,
      provider: message.provider, connectionId: message.connectionId,
      sourceMessageId: message.sourceMessageId,
      sourceMessageHash: canonicalHash(message as unknown as JsonValue),
      sender: message.sender, subject: message.subject,
      receivedAt: message.receivedAt, kind: input.kind,
      confidence: input.confidence, applicationId,
      rationale: input.rationale, evidenceQuotes: input.evidenceQuotes,
      securityFlags: message.securityFlags ?? [],
    });
  }

  public async list(): Promise<ExternalSignalV1[]> {
    const active = await requireInboxTaskAccess(
      this.conversationId, this.harness, "mail.read",
    );
    return this.harness.signals.list(active.task.id);
  }

  async #ingest(task: AgentTaskV1, message: InboxMessagePayloadV1, dedupeKey: string) {
    if (!this.harness.evidence) throw new Error("加密 Connector evidence store 不可用");
    const payloadHash = canonicalHash(message as unknown as JsonValue);
    let event = await this.harness.events.findByDedupeKey(task.id, dedupeKey);
    if (!event) {
      const evidence = await this.harness.evidence.save({
        taskId: task.id, runId: task.activeRunId!, kind: "connector_payload",
        payloadHash, payload: message as unknown as JsonValue,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
      event = await this.harness.events.enqueue({
        taskId: task.id, source: "mail", type: "mail.message_received",
        trust: "external_untrusted", occurredAt: message.receivedAt,
        dedupeKey, payloadRef: evidence.id, payloadHash,
      });
    }
    await this.harness.events.markDelivered(event.id);
    return {
      eventId: event.id, provider: message.provider, sender: message.sender,
      subject: message.subject, receivedAt: message.receivedAt,
      sourceMessageHash: payloadHash, securityFlags: message.securityFlags ?? [],
    };
  }

}

function requireSelectedConnection(policy: Record<string, JsonValue> | undefined, id: string): void {
  const values = policy?.mailConnectionIds;
  if (!Array.isArray(values) || !values.includes(id)) {
    throw new Error("该邮箱连接未包含在当前 DelegationGrant");
  }
}

function readPayload(value: JsonValue): InboxMessagePayloadV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Connector payload 无效");
  }
  return structuredClone(value) as unknown as InboxMessagePayloadV1;
}

function assertEvidenceQuotes(message: InboxMessagePayloadV1, quotes: string[]): void {
  const source = `${message.sender}\n${message.subject}\n${message.bodyText}`;
  if (quotes.some((quote) => !quote.trim() || !source.includes(quote.trim()))) {
    throw new Error("ExternalSignal evidence quote 必须逐字来自当前邮件");
  }
}

function matchesAllowedDomain(host: string, domains: string[]): boolean {
  const normalized = host.toLowerCase();
  return domains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}
