import type { WebContents } from "electron";

export interface ScopedAxNode {
  ignored?: boolean;
  nodeId?: string;
  parentId?: string;
  backendDOMNodeId?: number;
  role?: { value?: unknown };
  name?: { value?: unknown };
  sessionId?: string;
}

interface FrameTree {
  frame: { id: string };
  childFrames?: FrameTree[];
}

interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
}

export async function withAccessibilityNodes<T>(
  contents: WebContents,
  operation: (nodes: ScopedAxNode[]) => Promise<T>,
): Promise<T> {
  const debug = contents.debugger;
  const owned = !debug.isAttached();
  const sessions: string[] = [];
  if (owned) debug.attach("1.3");
  try {
    const nodes = await readRootFrames(contents);
    nodes.push(...await readSameOriginTargets(contents, sessions));
    return await operation(nodes);
  } finally {
    for (const sessionId of sessions) {
      await debug.sendCommand("Target.detachFromTarget", { sessionId }).catch(() => {});
    }
    if (owned && debug.isAttached()) debug.detach();
  }
}

async function readRootFrames(contents: WebContents): Promise<ScopedAxNode[]> {
  try {
    const result = await contents.debugger.sendCommand("Page.getFrameTree") as {
      frameTree?: FrameTree;
    };
    const frameIds = result.frameTree ? collectFrameIds(result.frameTree) : [];
    if (frameIds.length === 0) return readAxNodes(contents);
    const nodes: ScopedAxNode[] = [];
    for (const frameId of frameIds) {
      const frameNodes = await readAxNodes(contents, { frameId });
      nodes.push(...prefixNodes(frameNodes, `frame:${frameId}`));
    }
    return nodes;
  } catch {
    return readAxNodes(contents);
  }
}

async function readSameOriginTargets(
  contents: WebContents,
  sessions: string[],
): Promise<ScopedAxNode[]> {
  const origin = safeOrigin(contents.getURL());
  if (!origin) return [];
  try {
    const result = await contents.debugger.sendCommand("Target.getTargets") as {
      targetInfos?: TargetInfo[];
    };
    const targets = (result.targetInfos ?? []).filter((target) =>
      target.type === "iframe" && safeOrigin(target.url) === origin);
    const nodes: ScopedAxNode[] = [];
    for (const target of targets) {
      try {
        const attached = await contents.debugger.sendCommand(
          "Target.attachToTarget", { targetId: target.targetId, flatten: true },
        ) as { sessionId?: string };
        const sessionId = attached.sessionId;
        if (!sessionId) continue;
        sessions.push(sessionId);
        const targetNodes = await readAxNodes(contents, {}, sessionId);
        nodes.push(...prefixNodes(
          targetNodes.map((node) => ({ ...node, sessionId })),
          `target:${target.targetId}`,
        ));
      } catch {
        // A detached or inaccessible target is not safe to automate.
      }
    }
    return nodes;
  } catch {
    return [];
  }
}

async function readAxNodes(
  contents: WebContents,
  params: Record<string, string> = {},
  sessionId?: string,
): Promise<ScopedAxNode[]> {
  const result = await contents.debugger.sendCommand(
    "Accessibility.getFullAXTree", params, sessionId,
  ) as { nodes?: ScopedAxNode[] };
  return result.nodes ?? [];
}

function prefixNodes(nodes: ScopedAxNode[], prefix: string): ScopedAxNode[] {
  return nodes.map((node) => ({
    ...node,
    ...(node.nodeId ? { nodeId: `${prefix}:${node.nodeId}` } : {}),
    ...(node.parentId ? { parentId: `${prefix}:${node.parentId}` } : {}),
  }));
}

function collectFrameIds(tree: FrameTree): string[] {
  return [tree.frame.id, ...(tree.childFrames ?? []).flatMap(collectFrameIds)];
}

function safeOrigin(value: string): string | null {
  try { return new URL(value).origin; }
  catch { return null; }
}
