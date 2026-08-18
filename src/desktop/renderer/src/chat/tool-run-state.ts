export interface ToolRun {
  callId: string;
  name: string;
  label?: string;
  status: "running" | "completed" | "error";
  error?: string;
  progressLabel?: string;
}

export interface ToolCompletion {
  callId: string;
  isError: boolean;
  error?: string;
  progressLabel?: string;
}

export function completeToolRun(
  runs: ToolRun[],
  event: ToolCompletion,
): void {
  const run = runs.find((candidate) => candidate.callId === event.callId);
  if (!run) return;
  run.status = event.isError ? "error" : "completed";
  if (event.error) run.error = event.error;
  else delete run.error;
  if (event.progressLabel) run.progressLabel = event.progressLabel;
}
