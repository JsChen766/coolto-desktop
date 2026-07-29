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
import { app } from "electron";

import { sanitizeAgentMessagesForPersistence } from "../../agent/persistence-policy.js";
import type {
  ConversationDetail,
  ConversationSummary,
} from "../shared/types.js";
import type { ResumeDraftArtifactReference } from "../../resume/draft/types.js";
import {
  mergeExperienceImportResult,
  type ExperienceImportResultDetails,
} from "../../import/result-artifact.js";
import { projectConversationMessages } from "./conversation-presentation.js";
import {
  UNTITLED_CONVERSATION,
  assertConversationId,
  conversationDetail,
  conversationSummary,
  decryptConversation,
  deriveConversationTitle,
  encryptConversation,
  isMissingConversationFile,
  isStoredConversation,
  type StoredConversation,
  withArtifactAnchor,
} from "./conversation-record.js";

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
      .map(conversationSummary);
  }

  public async create(): Promise<ConversationDetail> {
    const now = new Date().toISOString();
    const conversation: StoredConversation = {
      version: 2,
      id: randomUUID(),
      ownerId: this.#ownerId,
      title: UNTITLED_CONVERSATION,
      createdAt: now,
      updatedAt: now,
      agentMessages: [],
      resumeArtifacts: [],
      experienceImportArtifacts: [],
    };
    await this.#write(conversation);
    return conversationDetail(conversation);
  }

  public async get(conversationId: string): Promise<ConversationDetail> {
    return conversationDetail(await this.getRecord(conversationId));
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
    record.version = 2;
    record.agentMessages = sanitizeAgentMessagesForPersistence(messages);
    const visibleMessages = projectConversationMessages(record.agentMessages);
    record.resumeArtifacts = (record.resumeArtifacts ?? []).map((artifact) =>
      withArtifactAnchor(artifact, visibleMessages),
    );
    record.updatedAt = new Date().toISOString();
    if (record.title === UNTITLED_CONVERSATION) {
      record.title = deriveConversationTitle(messages);
    }
    await this.#write(record);
    return conversationDetail(record);
  }

  public async addResumeArtifact(
    conversationId: string,
    artifact: ResumeDraftArtifactReference,
  ): Promise<ConversationDetail> {
    const record = await this.getRecord(conversationId);
    record.version = 2;
    const artifacts = record.resumeArtifacts ?? [];
    const existing = artifacts.findIndex(
      (candidate) => candidate.artifactId === artifact.artifactId,
    );
    if (existing >= 0) {
      const previous = artifacts[existing];
      artifacts[existing] = {
        ...structuredClone(artifact),
        ...(previous?.anchorMessageId
          ? { anchorMessageId: previous.anchorMessageId }
          : {}),
      };
    } else {
      artifacts.push(structuredClone(artifact));
    }
    record.resumeArtifacts = artifacts;
    record.updatedAt = new Date().toISOString();
    await this.#write(record);
    return conversationDetail(record);
  }

  public async addExperienceImportResult(
    conversationId: string,
    result: ExperienceImportResultDetails,
  ): Promise<ConversationDetail> {
    const record = await this.getRecord(conversationId);
    record.version = 2;
    const artifacts = record.experienceImportArtifacts ?? [];
    const index = artifacts.findIndex(
      (artifact) => artifact.proposalId === result.proposalId,
    );
    const merged = mergeExperienceImportResult(artifacts[index], result);
    if (index >= 0) artifacts[index] = merged;
    else artifacts.push(merged);
    record.experienceImportArtifacts = artifacts;
    record.updatedAt = new Date().toISOString();
    await this.#write(record);
    return conversationDetail(record);
  }

  public async rename(
    conversationId: string,
    title: string,
  ): Promise<ConversationSummary> {
    const record = await this.getRecord(conversationId);
    record.title = title.trim().slice(0, 80) || UNTITLED_CONVERSATION;
    record.updatedAt = new Date().toISOString();
    await this.#write(record);
    return conversationSummary(record);
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
      const serialized = decryptConversation(encrypted);
      const parsed = JSON.parse(serialized) as unknown;
      return isStoredConversation(parsed) ? parsed : undefined;
    } catch (error: unknown) {
      if (isMissingConversationFile(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async #write(record: StoredConversation): Promise<void> {
    await this.#ensureDirectory();
    const destination = this.#pathFor(record.id);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    const encrypted = encryptConversation(JSON.stringify(record));
    await writeFile(temporary, encrypted, { mode: 0o600 });
    await rename(temporary, destination);
  }
}
