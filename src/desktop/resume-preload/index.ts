import { contextBridge, ipcRenderer } from "electron";

import {
  RESUME_COMPILE_CHANNEL,
  RESUME_COMPILE_RESULT_CHANNEL,
  type ResumeCompileRequest,
  type ResumeCompileResponse,
  type ResumeRendererHostApi,
} from "../../resume/compiler-types.js";

const api: ResumeRendererHostApi = {
  onCompile(listener) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      request: ResumeCompileRequest,
    ): void => {
      void listener(request);
    };
    ipcRenderer.on(RESUME_COMPILE_CHANNEL, handler);
    return () => ipcRenderer.removeListener(RESUME_COMPILE_CHANNEL, handler);
  },
  sendResult(response: ResumeCompileResponse) {
    ipcRenderer.send(RESUME_COMPILE_RESULT_CHANNEL, response);
  },
};

contextBridge.exposeInMainWorld("resumeRendererHost", api);

