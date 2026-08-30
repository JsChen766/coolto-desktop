import { createHash } from "node:crypto";

import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";

const REFERENCE_TOOLS = new Set([
  "search_experiences",
  "get_experience",
  "find_resume_reuse_candidates",
  "create_resume_workspace",
  "get_resume_workspace",
  "apply_resume_content",
  "add_resume_material",
  "confirm_no_resume_material",
  "prepare_experience_sync",
  "begin_experience_material_ingestion",
  "record_experience_material_chunk",
]);

/** Keeps long experience UUIDs out of the model-visible resume workflow. */
export class ExperienceReferenceRegistry {
  readonly #canonicalByReference = new Map<string, string>();
  readonly #referenceByCanonical = new Map<string, string>();

  public constructor(
    private readonly restoredExperienceIds?: () => readonly string[] | undefined,
  ) {}

  public wrap(tool: AgentTool): AgentTool {
    if (!REFERENCE_TOOLS.has(tool.name)) return tool;
    return {
      ...tool,
      execute: async (toolCallId, params, signal, onUpdate) => {
        this.#seedRestoredExperienceIds();
        const resolved = this.#replaceReferences(params, "resolve");
        this.#captureExperienceIds(resolved);
        const result = await tool.execute(toolCallId, resolved, signal, onUpdate);
        this.#captureToolResult(tool.name, result.details);
        return this.#projectResult(result);
      },
    };
  }

  public referenceFor(canonicalId: string): string {
    const normalized = canonicalId.trim();
    const existing = this.#referenceByCanonical.get(normalized);
    if (existing) return existing;
    const digest = createHash("sha256").update(normalized).digest("hex");
    for (let length = 12; length <= digest.length; length += 4) {
      const reference = `exp_${digest.slice(0, length)}`;
      const current = this.#canonicalByReference.get(reference);
      if (!current || current === normalized) {
        this.#referenceByCanonical.set(normalized, reference);
        this.#canonicalByReference.set(reference, normalized);
        return reference;
      }
    }
    throw new Error("无法为经历生成唯一短引用");
  }

  #seedRestoredExperienceIds(): void {
    this.restoredExperienceIds?.()?.forEach((id) => this.referenceFor(id));
  }

  #projectResult(result: AgentToolResult<unknown>): AgentToolResult<unknown> {
    return {
      ...result,
      content: result.content.map((entry) => {
        if (entry.type !== "text") return entry;
        try {
          const parsed = JSON.parse(entry.text) as unknown;
          return {
            ...entry,
            text: JSON.stringify(this.#replaceReferences(parsed, "project")),
          };
        } catch {
          return entry;
        }
      }),
    };
  }

  #captureToolResult(toolName: string, details: unknown): void {
    if (!details || typeof details !== "object") return;
    if (toolName === "search_experiences") {
      const items = (details as { items?: unknown }).items;
      if (Array.isArray(items)) items.forEach((item) => this.#captureId(item));
    }
    if (toolName === "get_experience") this.#captureId(details);
    if (toolName === "find_resume_reuse_candidates") {
      this.#captureExperienceIds(details);
    }
    if (toolName === "record_experience_material_chunk") {
      this.#captureExperienceIds(details);
    }
    if (toolName === "create_resume_workspace" || toolName === "get_resume_workspace") {
      const experiences = (details as {
        source?: { experiences?: unknown };
      }).source?.experiences;
      if (Array.isArray(experiences)) {
        experiences.forEach((experience) => this.#captureId(experience));
      }
    }
  }

  #captureId(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) this.referenceFor(id);
  }

  #captureExperienceIds(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((entry) => this.#captureExperienceIds(entry));
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (key === "experienceId" && typeof entry === "string" && entry.trim()) {
        if (!isShortReference(entry)) this.referenceFor(entry);
      } else if (key === "experienceIds" && Array.isArray(entry)) {
        entry.forEach((id) => {
          if (typeof id === "string" && id.trim() && !isShortReference(id)) {
            this.referenceFor(id);
          }
        });
      } else {
        this.#captureExperienceIds(entry);
      }
    }
  }

  #replaceReferences(value: unknown, mode: "resolve" | "project"): any {
    if (typeof value === "string") {
      return mode === "resolve"
        ? (this.#canonicalByReference.get(value) ?? value)
        : (this.#referenceByCanonical.get(value) ?? value);
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.#replaceReferences(entry, mode));
    }
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        this.#replaceReferences(entry, mode),
      ]),
    );
  }
}

function isShortReference(value: string): boolean {
  return /^exp_[a-z0-9]+$/iu.test(value.trim());
}
