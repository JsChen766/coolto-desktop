import type { WebContents } from "electron";

import type { BrowserAccessibilityNode } from "../../../browser/agent-control-types.js";

const MAX_AX_NODES = 500;
const SENSITIVE_NAME = /(password|passcode|密码|口令|otp|one.?time|verification code|验证码|安全码)/iu;

interface CdpAxValue { value?: unknown }
interface CdpAxNode {
  ignored?: boolean;
  role?: CdpAxValue;
  name?: CdpAxValue;
  value?: CdpAxValue;
  description?: CdpAxValue;
  properties?: Array<{ name?: string; value?: CdpAxValue }>;
}

export async function readAccessibilityTree(
  contents: WebContents,
): Promise<{ nodes: BrowserAccessibilityNode[]; truncated: boolean }> {
  const debug = contents.debugger;
  const owned = !debug.isAttached();
  if (owned) debug.attach("1.3");
  try {
    const result = await debug.sendCommand("Accessibility.getFullAXTree") as {
      nodes?: CdpAxNode[];
    };
    const source = (result.nodes ?? []).filter((node) => !node.ignored);
    return {
      nodes: source.slice(0, MAX_AX_NODES).map(toNode),
      truncated: source.length > MAX_AX_NODES,
    };
  } finally {
    if (owned && debug.isAttached()) debug.detach();
  }
}

function toNode(node: CdpAxNode): BrowserAccessibilityNode {
  const protectedValue = node.properties?.some((property) =>
    property.name === "protected" && property.value?.value === true,
  ) ?? false;
  const disabled = node.properties?.some((property) =>
    property.name === "disabled" && property.value?.value === true,
  ) ?? false;
  const name = text(node.name, 300);
  return {
    role: text(node.role, 80),
    name,
    value: protectedValue || SENSITIVE_NAME.test(name)
      ? "[REDACTED]"
      : text(node.value, 500),
    description: text(node.description, 300),
    disabled,
  };
}

function text(value: CdpAxValue | undefined, limit: number): string {
  return String(value?.value ?? "").replace(/\s+/gu, " ").trim().slice(0, limit);
}
