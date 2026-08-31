import type { WebContents } from "electron";

import type { FormElementSummary } from "../../../browser/types.js";
import {
  type ScopedAxNode as AxNode,
  withAccessibilityNodes,
} from "./browser-accessibility-scopes.js";

const INTERACTIVE_ROLES = new Set([
  "button", "link", "option", "row", "listitem", "treeitem", "tab",
]);

export async function tagAccessibleElements(
  contents: WebContents,
  maxElements: number,
  preferredText?: string,
): Promise<FormElementSummary[]> {
  if (maxElements <= 0) return [];
  return withAccessibilityNodes(contents, async (nodes) => {
    const candidates = candidatesFor(
      nodes, maxElements, preferredText,
    );
    const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const tagged: FormElementSummary[] = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      const summary = await tagNode(
        contents, candidate.node, `ax-${seed}-${index + 1}`,
      );
      if (summary) tagged.push(candidate.matchedText
        ? { ...summary, text: clean(`${summary.text ?? ""} ${candidate.matchedText}`, 300) }
        : summary);
    }
    return tagged;
  });
}

interface Candidate {
  node: AxNode;
  index: number;
  score: number;
  matchedText: string;
}

function candidatesFor(
  nodes: AxNode[],
  maxElements: number,
  preferredText: string | undefined,
): Candidate[] {
  const interactive = nodes.map((node, index) => ({ node, index }))
    .filter((item) => isInteractive(item.node));
  if (!preferredText) return interactive.slice(0, maxElements)
    .map((item) => ({ ...item, score: 0, matchedText: "" }));
  const wanted = tokens(clean(preferredText, 1_000).toLowerCase());
  const byId = new Map(nodes.filter((node) => node.nodeId)
    .map((node) => [node.nodeId!, node]));
  const found = new Map<AxNode, {
    index: number; tokens: Set<string>; texts: Set<string>;
  }>();
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    const name = clean(node.name?.value, 500);
    const matched = wanted.filter((token) => name.toLowerCase().includes(token));
    if (matched.length === 0) continue;
    const ancestor = interactiveAncestor(node, byId);
    if (!ancestor) continue;
    const value = found.get(ancestor) ?? {
      index, tokens: new Set<string>(), texts: new Set<string>(),
    };
    matched.forEach((token) => value.tokens.add(token));
    if (name) value.texts.add(name);
    found.set(ancestor, value);
  }
  return [...found.entries()].map(([node, value]) => ({
    node, index: value.index, score: value.tokens.size,
    matchedText: [...value.texts].join(" "),
  })).sort((left, right) =>
    right.score - left.score || left.index - right.index)
    .slice(0, Math.min(20, maxElements));
}

function interactiveAncestor(
  start: AxNode,
  byId: Map<string, AxNode>,
): AxNode | undefined {
  let current: AxNode | undefined = start;
  for (let depth = 0; current && depth < 12; depth += 1) {
    if (isInteractive(current)) return current;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return undefined;
}

function isInteractive(node: AxNode): boolean {
  const role = String(node.role?.value ?? "").toLowerCase();
  return !node.ignored && Boolean(node.backendDOMNodeId) &&
    INTERACTIVE_ROLES.has(role);
}

async function tagNode(
  contents: WebContents,
  node: AxNode,
  fillId: string,
): Promise<FormElementSummary | null> {
  try {
    const resolved = await contents.debugger.sendCommand("DOM.resolveNode", {
      backendNodeId: node.backendDOMNodeId,
    }, node.sessionId) as { object?: { objectId?: string } };
    const objectId = resolved.object?.objectId;
    if (!objectId) return null;
    const result = await contents.debugger.sendCommand("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: TAG_FUNCTION,
      arguments: [{ value: fillId }],
      returnByValue: true,
    }, node.sessionId) as { result?: { value?: FormElementSummary | null } };
    return result.result?.value ?? null;
  } catch {
    return null;
  }
}

const TAG_FUNCTION = `function(fillId) {
  if (!this || typeof this.setAttribute !== 'function') return null;
  const existing = this.getAttribute('data-fill-id');
  const id = existing || fillId;
  if (!existing) this.setAttribute('data-fill-id', id);
  const tag = String(this.tagName || '').toLowerCase();
  const role = String(this.getAttribute('role') || '');
  const text = String(this.innerText || this.textContent || '')
    .replace(/\\s+/g, ' ').trim().slice(0, 300);
  const label = String(this.getAttribute('aria-label') ||
    this.getAttribute('title') || text).slice(0, 200);
  const kind = ['input','textarea','select','button','a'].includes(tag)
    ? tag : (this.isContentEditable ? 'contenteditable' : 'other');
  return {
    fillId: id, elementType: kind,
    inputType: tag === 'input' ? String(this.getAttribute('type') || 'text') : undefined,
    role, text, label,
    placeholder: String(this.getAttribute('placeholder') || '').slice(0, 200),
    required: this.hasAttribute('required') || this.getAttribute('aria-required') === 'true'
  };
}`;

function clean(value: unknown, limit: number): string {
  return String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, limit);
}

function tokens(value: string): string[] {
  return [...new Set(value.split(/[^\p{L}\p{N}]+/u).filter((item) => item.length >= 2))];
}
