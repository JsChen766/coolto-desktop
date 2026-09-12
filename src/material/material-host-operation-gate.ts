type GateState = "open" | "closing" | "closed";

/** Owner-local admission barrier: accepted operations finish before teardown starts. */
export class MaterialHostOperationGate {
  #state: GateState = "open";
  #active = 0;
  #idle: Promise<void> | undefined;
  #releaseIdle: (() => void) | undefined;

  public run<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.#state !== "open") return Promise.reject(this.#closingError());
    this.#active += 1;
    return Promise.resolve().then(operation).finally(() => this.#release());
  }

  public assertOpen(): void {
    if (this.#state !== "open") throw this.#closingError();
  }

  public quiesce(): Promise<void> {
    if (this.#state === "open") {
      this.#state = "closing";
      this.#idle = this.#active === 0 ? Promise.resolve() : new Promise((resolve) => { this.#releaseIdle = resolve; });
    }
    return this.#idle!.then(() => { this.#state = "closed"; });
  }

  #release(): void {
    this.#active -= 1;
    if (this.#active === 0) this.#releaseIdle?.();
  }
  #closingError(): Error { return new Error("材料服务正在关闭，不能开始新操作"); }
}
