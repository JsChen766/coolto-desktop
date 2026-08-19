import type { ActionExecutor } from "../../approvals/executor-registry.js";
import type { ResumeCompiler } from "../workspace/compiler-port.js";
import { generationWorkspaceStatus } from "../workspace/generation-readiness.js";
import { pendingAugmentedContent } from "../workspace/augmentation-state.js";
import type { ResumeWorkspace } from "../workspace/types.js";
import { ResumeWorkspaceStore } from "../workspace/workspace-store.js";
import { readAugmentedApprovalPayload } from "./augmented-approval.js";

export function createAugmentedConfirmationExecutor(
  store: ResumeWorkspaceStore,
  compiler: ResumeCompiler,
): ActionExecutor {
  return {
    execute: async (context) => {
      const payload = readAugmentedApprovalPayload(context.payload);
      const workspace = requireCurrent(store, payload);
      const confirmed = new Set(payload.bulletIds);
      const provenance = (workspace.bulletProvenance ?? []).map((entry) =>
        confirmed.has(entry.bulletId) &&
          entry.origin === "agent_augmented" &&
          entry.confirmation === "pending"
          ? { ...entry, confirmation: "confirmed" as const }
          : entry,
      );
      const augmentedFragments = (workspace.augmentedFragments ?? []).map(
        (entry) => confirmed.has(entry.bulletId) &&
            entry.confirmation === "pending"
          ? { ...entry, confirmation: "confirmed" as const }
          : entry,
      );
      const revision = workspace.revision + 1;
      const pending = hasPending(provenance, augmentedFragments);
      const updated: ResumeWorkspace = {
          ...workspace,
          revision,
          compileObservedRevision: revision,
          bulletProvenance: provenance,
          augmentedFragments,
          awaitingUserConfirmation: pending
            ? (workspace.awaitingUserConfirmation ?? {
                note: "agent_augmented content requires confirmation",
              })
            : null,
          bestSnapshot: { ...workspace.bestSnapshot, revision },
        };
      updated.status = generationWorkspaceStatus(updated);
      store.replace(updated, workspace.revision);
      return {
        summary: `已确认 ${payload.bulletIds.length} 条 AI 补写内容`,
        details: { candidateId: payload.candidateId, confirmed: payload.bulletIds },
      };
    },
    reject: async (context) => {
      if (context.decision?.type !== "reject") return;
      const payload = readAugmentedApprovalPayload(context.payload);
      const workspace = requireCurrent(store, payload);
      const selected = new Set(payload.bulletIds);
      const removedBullets = new Set(
        (workspace.bulletProvenance ?? []).flatMap((entry) =>
          selected.has(entry.bulletId) &&
            entry.origin === "agent_augmented" &&
            entry.confirmation === "pending"
            ? [entry.bulletId]
            : [],
        ),
      );
      const restoredFragments = new Map(
        (workspace.augmentedFragments ?? []).flatMap((entry) =>
          selected.has(entry.bulletId) && entry.confirmation === "pending"
            ? [[entry.bulletId, entry.baseText] as const]
            : [],
        ),
      );
      const structure = structuredClone(workspace.structure);
      for (const section of structure.sections) {
        for (const item of section.items) {
          item.bullets = item.bullets.flatMap((bullet) => {
            if (removedBullets.has(bullet.id)) return [];
            return [{
              ...bullet,
              text: restoredFragments.get(bullet.id) ?? bullet.text,
            }];
          });
        }
      }
      const bindings = workspace.bindings.filter(
        (binding) => !removedBullets.has(binding.bulletId),
      );
      const provenance = (workspace.bulletProvenance ?? []).filter(
        (entry) => !removedBullets.has(entry.bulletId),
      );
      const augmentedFragments = (workspace.augmentedFragments ?? []).filter(
        (entry) => !selected.has(entry.bulletId),
      );
      const compileResult = await compiler.compile(structure);
      const revision = workspace.revision + 1;
      const updated: ResumeWorkspace = {
          ...workspace,
          revision,
          structure,
          bindings,
          bulletProvenance: provenance,
          augmentedFragments,
          compileResult,
          compileObservedRevision: revision,
          status: "writing",
          awaitingUserConfirmation: hasPending(provenance, augmentedFragments)
            ? (workspace.awaitingUserConfirmation ?? {
                note: "agent_augmented content requires confirmation",
              })
            : null,
          bestSnapshot: snapshot(revision, structure, bindings, compileResult),
        };
      updated.status = generationWorkspaceStatus(updated);
      store.replace(updated, workspace.revision);
    },
  };
}

function requireCurrent(
  store: ResumeWorkspaceStore,
  payload: ReturnType<typeof readAugmentedApprovalPayload>,
): ResumeWorkspace {
  const workspace = store.get(payload.candidateId);
  if (workspace.revision !== payload.expectedRevision) {
    throw new Error("简历内容已变化，请重新检查 AI 补写内容");
  }
  const pending = new Set(
    pendingAugmentedContent(workspace).map((entry) => entry.bulletId),
  );
  if (payload.bulletIds.some((id) => !pending.has(id))) {
    throw new Error("待确认 AI 补写内容已经变化");
  }
  return workspace;
}

function hasPending(
  provenance: NonNullable<ResumeWorkspace["bulletProvenance"]>,
  fragments: NonNullable<ResumeWorkspace["augmentedFragments"]>,
): boolean {
  return provenance.some((entry) => entry.confirmation === "pending") ||
    fragments.some((entry) => entry.confirmation === "pending");
}

function snapshot(
  revision: number,
  structure: ResumeWorkspace["structure"],
  bindings: ResumeWorkspace["bindings"],
  compileResult: ResumeWorkspace["compileResult"],
) {
  return {
    revision,
    structure: structuredClone(structure),
    bindings: structuredClone(bindings),
    compileResult: structuredClone(compileResult),
  };
}
