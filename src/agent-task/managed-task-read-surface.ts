import type { BrowserAgentController } from "../browser/agent-control-types.js";
import {
  evaluateDelegationPolicy,
  type DelegationPolicyInput,
} from "./delegation-policy.js";
import type { PolicyDecisionV1 } from "./grant-types.js";

export function constrainManagedReadSurface(input: {
  browser: BrowserAgentController;
  decision: PolicyDecisionV1;
  policy: DelegationPolicyInput;
  sitePolicyAllows: (origin: string | null, toolName: string) => boolean;
  toolName: string;
}): PolicyDecisionV1 {
  if (input.decision.decision !== "allow") return input.decision;
  if (input.toolName === "browser_get_active_tab") {
    const active = input.browser.getActiveTab();
    return active
      ? strictOriginDecision(input, active.url)
      : input.decision;
  }
  if (input.toolName !== "browser_list_tabs") return input.decision;
  try {
    for (const tab of input.browser.listTabs()) {
      const decision = strictOriginDecision(input, tab.url);
      if (decision.decision !== "allow") return decision;
    }
    return input.decision;
  } catch {
    return block(input.decision, "browser_tab_inventory_unavailable");
  }
}

function strictOriginDecision(
  input: Parameters<typeof constrainManagedReadSurface>[0],
  url: string | null,
): PolicyDecisionV1 {
  const origin = httpOrigin(url);
  const decision = evaluateDelegationPolicy({
    ...input.policy,
    targetOrigin: origin,
    sitePolicyAllowed: Boolean(origin) && input.sitePolicyAllows(
      origin, "browser_snapshot",
    ),
  });
  return decision.decision === "allow"
    ? input.decision
    : block(input.decision, decision.reasonCode);
}

function block(decision: PolicyDecisionV1, reasonCode: string): PolicyDecisionV1 {
  return {
    ...decision,
    decision: "block",
    reasonCode,
    decidedAt: new Date().toISOString(),
  };
}

function httpOrigin(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.origin : null;
  } catch {
    return null;
  }
}
