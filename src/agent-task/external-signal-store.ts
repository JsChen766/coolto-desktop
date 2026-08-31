import type { AgentHarnessStateRepository } from "./agent-harness-state-repository.js";
import { requireTask } from "./agent-task-store.js";
import { canonicalHash } from "./canonical-hash.js";
import type { JsonValue } from "./json-types.js";
import { uuidV7 } from "./uuid-v7.js";
import type {
  ExternalSignalKind,
  ExternalSignalV1,
  InboxCursorV1,
  InboxProvider,
  MailDirection,
} from "../inbox-signals/inbox-signal-types.js";

export class ExternalSignalStore {
  public constructor(
    private readonly ownerId: string,
    private readonly repository: AgentHarnessStateRepository,
  ) {}

  public cursor(
    taskId: string,
    provider: InboxProvider,
    connectionId: string,
  ): Promise<string | null> {
    return this.repository.read((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      return state.inboxCursors.find((value) =>
        value.taskId === taskId && value.provider === provider &&
        value.connectionId === connectionId)?.cursor ?? null;
    });
  }

  public saveCursor(input: Omit<InboxCursorV1, "version" | "ownerId">): Promise<void> {
    return this.repository.update((state) => {
      requireTask(state.tasks, input.taskId, this.ownerId);
      const existing = state.inboxCursors.find((value) =>
        value.taskId === input.taskId && value.provider === input.provider &&
        value.connectionId === input.connectionId);
      if (existing) Object.assign(existing, structuredClone(input));
      else state.inboxCursors.push({ version: 1, ownerId: this.ownerId, ...structuredClone(input) });
    });
  }

  public record(input: {
    taskId: string; eventId: string; provider: InboxProvider;
    connectionId: string; sourceMessageId: string; sourceMessageHash: string;
    direction: MailDirection; sender: string; subject: string; receivedAt: string;
    kind: ExternalSignalKind; confidence: number; applicationId: string | null;
    rationale: string; evidenceQuotes: string[];
    securityFlags?: string[];
  }): Promise<ExternalSignalV1> {
    validate(input);
    return this.repository.update((state) => {
      requireTask(state.tasks, input.taskId, this.ownerId);
      const event = state.events.find((value) =>
        value.id === input.eventId && value.taskId === input.taskId &&
        value.source === "mail");
      if (!event) throw new Error("Mail EnvironmentEvent 不存在或任务不匹配");
      const content = {
        ...structuredClone(input),
        sender: input.sender.trim(), subject: input.subject.trim(),
        rationale: input.rationale.trim(),
        evidenceQuotes: input.evidenceQuotes.map((value) => value.trim()),
        securityFlags: [...new Set(input.securityFlags ?? [])],
        status: input.kind === "other" ? "ignored" as const : "classified" as const,
      };
      const contentHash = canonicalHash(content as unknown as JsonValue);
      const existing = state.externalSignals.find((value) => value.eventId === input.eventId);
      if (existing) {
        if (existing.contentHash !== contentHash) {
          throw new Error("ExternalSignal 已记录，不能静默改写分类");
        }
        return existing;
      }
      const signal: ExternalSignalV1 = {
        version: 1, id: uuidV7(), ownerId: this.ownerId,
        ...content, contentHash, createdAt: new Date().toISOString(),
      };
      state.externalSignals.push(signal);
      return signal;
    });
  }

  public list(taskId: string): Promise<ExternalSignalV1[]> {
    return this.repository.read((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      return state.externalSignals.filter((value) => value.taskId === taskId)
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    });
  }

  public get(taskId: string, signalId: string): Promise<ExternalSignalV1> {
    return this.repository.read((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      const signal = state.externalSignals.find((value) =>
        value.id === signalId && value.taskId === taskId && value.ownerId === this.ownerId);
      if (!signal) throw new Error("ExternalSignal 不存在或任务不匹配");
      return signal;
    });
  }

  public markStatus(
    taskId: string,
    signalId: string,
    expectedHash: string,
    status: ExternalSignalV1["status"],
  ): Promise<ExternalSignalV1> {
    return this.repository.update((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      const signal = state.externalSignals.find((value) =>
        value.id === signalId && value.taskId === taskId && value.ownerId === this.ownerId);
      if (!signal || signal.contentHash !== expectedHash) {
        throw new Error("ExternalSignal 已变化，请重新检查");
      }
      signal.status = status;
      return signal;
    });
  }

  public assertAllMailEventsClassified(taskId: string): Promise<void> {
    return this.repository.read((state) => {
      requireTask(state.tasks, taskId, this.ownerId);
      const recorded = new Set(state.externalSignals.map((value) => value.eventId));
      const pending = state.events.filter((event) =>
        event.taskId === taskId && event.source === "mail" &&
        event.status !== "dead_letter" && !recorded.has(event.id));
      if (pending.length) throw new Error(`仍有 ${pending.length} 封邮件未分类或关联`);
    });
  }
}

function validate(input: {
  confidence: number; rationale: string; evidenceQuotes: string[];
  sender: string; subject: string; receivedAt: string;
}): void {
  if (!Number.isInteger(input.confidence) || input.confidence < 0 || input.confidence > 100) {
    throw new Error("ExternalSignal confidence 必须是 0–100 整数");
  }
  if (!input.sender.trim() || !input.subject.trim() || !input.rationale.trim()) {
    throw new Error("ExternalSignal sender/subject/rationale 不能为空");
  }
  if (!Number.isFinite(Date.parse(input.receivedAt))) throw new Error("邮件接收时间无效");
  if (input.evidenceQuotes.length > 3 ||
      input.evidenceQuotes.some((value) => !value.trim() || value.length > 500)) {
    throw new Error("ExternalSignal 最多保存 3 条、每条 500 字的必要引用");
  }
}
