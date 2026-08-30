import type {
  BrowserAgentChromeView,
  BrowserAgentProjectionFacts,
} from "../desktop/shared/types/browser-agent.js";

const TERMINAL = new Set([
  "completed", "partially_completed", "failed", "canceled", "expired",
]);

export function deriveBrowserAgentCommands(
  facts: BrowserAgentProjectionFacts,
  grant: "active" | "expired" | "revoked" | null,
  pending: boolean,
): BrowserAgentChromeView["commands"] {
  const status = facts.task.status;
  if (TERMINAL.has(status) || grant === "revoked" || grant === "expired") {
    return { pause: false, resume: false, takeover: false, stop: false, openTask: true };
  }
  const running = status === "running";
  const reviewing = facts.pageAccess?.mode === "reviewing" || Boolean(facts.review);
  const waitingCanResume = status === "waiting" &&
    !["approval", "answer"].includes(facts.task.waitingReason ?? "");
  return {
    pause: !pending && running && facts.control === "agent",
    resume: !pending && grant === "active" && (status === "paused" || waitingCanResume),
    takeover: !pending && running && !reviewing && facts.control === "agent",
    stop: !pending,
    openTask: true,
  };
}
