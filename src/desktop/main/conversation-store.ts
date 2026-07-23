import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { app, safeStorage } from "electron";

import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
} from "../shared/types.js";

interface StoredConversation {
  version: 1;
  id: string;
  ownerId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  agentMessages: AgentMessage[];
}

const UNTITLED = "新对话";

export class ConversationStore {
  readonly #ownerId: string;
  readonly #directory: string;

  public constructor(ownerId: string) {
    this.#ownerId = ownerId;
    const ownerHash = createHash("sha256").update(ownerId).digest("hex").slice(0, 20);
    this.#directory = join(
      app.getPath("userData"),
      "conversations",
      ownerHash,
    );
  }

  public async list(): Promise<ConversationSummary[]> {
    await this.#ensureDirectory();
    const filenames = await readdir(this.#directory);
    const records = await Promise.all(
      filenames
        .filter((filename) => filename.endsWith(".coolto"))
        .map((filename) => this.#readFile(join(this.#directory, filename))),
    );
    return records
      .filter((record): record is StoredConversation => record !== undefined)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(toSummary);
  }

  public async create(): Promise<ConversationDetail> {
    const now = new Date().toISOString();
    const conversation: StoredConversation = {
      version: 1,
      id: randomUUID(),
      ownerId: this.#ownerId,
      title: UNTITLED,
      createdAt: now,
      updatedAt: now,
      agentMessages: [],
    };
    await this.#write(conversation);
    return toDetail(conversation);
  }

  public async get(conversationId: string): Promise<ConversationDetail> {
    return toDetail(await this.getRecord(conversationId));
  }

  public async loadMessages(conversationId: string): Promise<AgentMessage[]> {
    return structuredClone((await this.getRecord(conversationId)).agentMessages);
  }

  private async getRecord(conversationId: string): Promise<StoredConversation> {
    assertConversationId(conversationId);
    const record = await this.#readFile(this.#pathFor(conversationId));
    if (!record || record.ownerId !== this.#ownerId) {
      throw new Error("对话不存在或不属于当前用户");
    }
    return record;
  }

  public async saveMessages(
    conversationId: string,
    messages: AgentMessage[],
  ): Promise<ConversationDetail> {
    const record = await this.getRecord(conversationId);
    record.agentMessages = structuredClone(messages);
    record.updatedAt = new Date().toISOString();
    if (record.title === UNTITLED) {
      record.title = deriveTitle(messages);
    }
    await this.#write(record);
    return toDetail(record);
  }

  public async rename(
    conversationId: string,
    title: string,
  ): Promise<ConversationSummary> {
    const record = await this.getRecord(conversationId);
    record.title = title.trim().slice(0, 80) || UNTITLED;
    record.updatedAt = new Date().toISOString();
    await this.#write(record);
    return toSummary(record);
  }

  public async delete(conversationId: string): Promise<void> {
    await this.getRecord(conversationId);
    await unlink(this.#pathFor(conversationId));
  }

  async #ensureDirectory(): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
  }

  #pathFor(conversationId: string): string {
    return join(this.#directory, `${conversationId}.coolto`);
  }

  async #readFile(path: string): Promise<StoredConversation | undefined> {
    try {
      const encrypted = await readFile(path);
      const serialized = decrypt(encrypted);
      const parsed = JSON.parse(serialized) as unknown;
      return isStoredConversation(parsed) ? parsed : undefined;
    } catch (error: unknown) {
      if (isMissingFileError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async #write(record: StoredConversation): Promise<void> {
    await this.#ensureDirectory();
    const destination = this.#pathFor(record.id);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    const encrypted = encrypt(JSON.stringify(record));
    await writeFile(temporary, encrypted, { mode: 0o600 });
    await rename(temporary, destination);
  }
}

function encrypt(value: string): Buffer {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，拒绝明文保存本地对话");
  }
  return safeStorage.encryptString(value);
}

function decrypt(value: Buffer): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，无法读取本地对话");
  }
  return safeStorage.decryptString(value);
}

function toSummary(record: StoredConversation): ConversationSummary {
  return {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: extractChatMessages(record.agentMessages).length,
  };
}

function toDetail(record: StoredConversation): ConversationDetail {
  return {
    ...toSummary(record),
    messages: extractChatMessages(record.agentMessages),
  };
}

function extractChatMessages(messages: AgentMessage[]): ChatMessage[] {
  const visible: ChatMessage[] = [];
  messages.forEach((message, index) => {
    if (message.role !== "user" && message.role !== "assistant") {
      return;
    }
    const content = extractText(message.content);
    if (!content.trim()) {
      return;
    }
    const timestamp =
      typeof message.timestamp === "number"
        ? new Date(message.timestamp).toISOString()
        : new Date().toISOString();
    visible.push({
      id: `${message.role}-${message.timestamp ?? index}-${index}`,
      role: message.role,
      content,
      createdAt: timestamp,
    });
  });
  return visible;
}

function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function deriveTitle(messages: AgentMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  const text = firstUser ? extractText(firstUser.content) : "";
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 28) : UNTITLED;
}

function assertConversationId(value: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error("无效的对话 ID");
  }
}

function isStoredConversation(value: unknown): value is StoredConversation {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<StoredConversation>;
  return (
    candidate.version === 1 &&
    typeof candidate.id === "string" &&
    typeof candidate.ownerId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    Array.isArray(candidate.agentMessages)
  );
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
