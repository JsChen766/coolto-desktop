import type { SelectedFileMetadata } from "../../files/types.js";
import { SelectedFileRegistry } from "../../files/selected-file-registry.js";

export class ConversationSelectedFiles {
  readonly #registries = new Map<string, SelectedFileRegistry>();

  public forConversation(conversationId: string): SelectedFileRegistry {
    const existing = this.#registries.get(conversationId);
    if (existing) return existing;
    const created = new SelectedFileRegistry();
    this.#registries.set(conversationId, created);
    return created;
  }

  public list(conversationId: string): SelectedFileMetadata[] {
    return this.#registries.get(conversationId)?.list() ?? [];
  }

  public async replace(
    conversationId: string,
    path: string,
  ): Promise<SelectedFileMetadata> {
    const [selected] = await this.forConversation(
      conversationId,
    ).replacePaths([path]);
    if (!selected) throw new Error("文件选择器没有返回附件");
    return selected;
  }

  public remove(conversationId: string, fileId: string): void {
    const registry = this.#registries.get(conversationId);
    if (!registry) {
      throw new Error(`未找到用户明确选择的附件：${fileId}`);
    }
    registry.remove(fileId);
  }

  public release(conversationId: string): void {
    this.#registries.get(conversationId)?.clear();
    this.#registries.delete(conversationId);
  }

  public clear(): void {
    for (const registry of this.#registries.values()) registry.clear();
    this.#registries.clear();
  }
}
