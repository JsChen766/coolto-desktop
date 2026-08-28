type RunWaiter = () => void;

export class ConversationRunGate {
  #conversationId: string | undefined;
  readonly #sameConversationWaiters: RunWaiter[] = [];

  public get currentConversationId(): string | undefined {
    return this.#conversationId;
  }

  public get isRunning(): boolean {
    return this.#conversationId !== undefined;
  }

  public begin(conversationId: string): void {
    if (this.#conversationId) {
      if (this.#conversationId !== conversationId) {
        throw new Error("另一个对话正在回复，请等待完成或先停止");
      }
      throw new Error("正在处理上一条消息，请稍候再试");
    }
    this.#conversationId = conversationId;
  }

  public beginAfterCurrent(conversationId: string): Promise<void> {
    if (!this.#conversationId) {
      this.#conversationId = conversationId;
      return Promise.resolve();
    }
    if (this.#conversationId !== conversationId) {
      return Promise.reject(new Error("另一个对话正在回复，请等待完成或先停止"));
    }
    return new Promise((resolve) => {
      this.#sameConversationWaiters.push(resolve);
    });
  }

  public finish(conversationId: string): void {
    if (this.#conversationId !== conversationId) return;
    const next = this.#sameConversationWaiters.shift();
    if (next) {
      next();
      return;
    }
    this.#conversationId = undefined;
  }
}
