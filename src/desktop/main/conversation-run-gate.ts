interface RunWaiter {
  resolve: () => void;
  reject: (reason?: unknown) => void;
}
type IdleWaiter = () => void;

export class ConversationRunGate {
  #conversationId: string | undefined;
  readonly #sameConversationWaiters: RunWaiter[] = [];
  readonly #idleWaiters: IdleWaiter[] = [];

  public get currentConversationId(): string | undefined { return this.#conversationId; }
  public get isRunning(): boolean { return this.#conversationId !== undefined; }
  public get isAccepting(): boolean { return this.#accepting; }
  #accepting = true;

  public begin(conversationId: string): void {
    if (!this.#accepting) throw new Error("运行时正在退出，请稍候再试");
    if (this.#conversationId) {
      if (this.#conversationId !== conversationId) throw new Error("另一个对话正在回复，请等待完成或先停止");
      throw new Error("正在处理上一条消息，请稍候再试");
    }
    this.#conversationId = conversationId;
  }

  public beginAfterCurrent(conversationId: string): Promise<void> {
    if (!this.#accepting) return Promise.reject(new Error("运行时正在退出，请稍候再试"));
    if (!this.#conversationId) {
      this.#conversationId = conversationId;
      return Promise.resolve();
    }
    if (this.#conversationId !== conversationId) {
      return Promise.reject(new Error("另一个对话正在回复，请等待完成或先停止"));
    }
    const deferred = Promise.withResolvers<void>();
    this.#sameConversationWaiters.push({
      resolve: deferred.resolve,
      reject: deferred.reject,
    });
    return deferred.promise;
  }
  public quiesce(): void {
    this.#accepting = false;
    const waiters = this.#sameConversationWaiters.splice(0);
    for (const waiter of waiters) waiter.reject(new Error("运行时正在退出，请稍候再试"));
  }

  public waitForIdle(): Promise<void> {
    return this.#conversationId
      ? (() => {
          const deferred = Promise.withResolvers<void>();
          this.#idleWaiters.push(deferred.resolve);
          return deferred.promise;
        })()
      : Promise.resolve();
  }

  public finish(conversationId: string): void {
    if (this.#conversationId !== conversationId) return;
    const next = this.#sameConversationWaiters.shift();
    if (next) {
      next.resolve();
      return;
    }
    this.#conversationId = undefined;
    const waiters = this.#idleWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }
}
