import { performance } from "node:perf_hooks";

import type { ResumeStructure } from "../types.js";
import type {
  ResumePdfCompilation,
  ResumePdfCompiler,
} from "../export/types.js";
import type { ResumeCompileResult } from "../compiler-types.js";
import { ResumeGenerationTraceStore } from "./generation-trace-store.js";

export class TracedResumeCompiler implements ResumePdfCompiler {
  public constructor(
    private readonly delegate: ResumePdfCompiler,
    private readonly traces: ResumeGenerationTraceStore,
    private readonly conversationId: string,
  ) {}

  public compile(structure: ResumeStructure): Promise<ResumeCompileResult> {
    return this.#measure(() => this.delegate.compile(structure));
  }

  public compileForPdf(structure: ResumeStructure): Promise<ResumePdfCompilation> {
    return this.#measure(() => this.delegate.compileForPdf(structure));
  }

  async #measure<T>(operation: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      const result = await operation();
      this.traces.recordCompile(this.conversationId, performance.now() - startedAt, "success");
      return result;
    } catch (error) {
      this.traces.recordCompile(this.conversationId, performance.now() - startedAt, "error");
      throw error;
    }
  }
}
