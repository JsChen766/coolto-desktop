import type { ResumeCompileResult } from "../compiler-types.js";
import type { ResumeStructure } from "../types.js";

export interface ResumeCompiler {
  compile(
    structure: ResumeStructure,
    fixtureId?: string,
  ): Promise<ResumeCompileResult>;
}
