import "./style.css";

import type { ResumeRendererHostApi } from "../../../../resume/compiler-types";
import { compileResume } from "./compile";

declare global {
  interface Window {
    resumeRendererHost: ResumeRendererHostApi;
  }
}

const root = document.querySelector<HTMLElement>("#resume-renderer-root");
if (!root) {
  throw new Error("Resume renderer root is missing");
}

window.resumeRendererHost.onCompile(async (request) => {
  try {
    const result = await compileResume(
      root,
      request.structure,
      request.fixtureId,
    );
    window.resumeRendererHost.sendResult({
      requestId: request.requestId,
      result,
    });
  } catch (error: unknown) {
    window.resumeRendererHost.sendResult({
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

