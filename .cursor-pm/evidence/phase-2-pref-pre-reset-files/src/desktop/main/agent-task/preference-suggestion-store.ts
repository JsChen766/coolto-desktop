import {
  preferenceUsageFor,
  recordPreferenceUsage,
} from "../../../preference/usage-store.js";
import type { AgentHarnessStateRepository } from "../../../agent-task/agent-harness-state-repository.js";
import {
  activeSuggestionSuppressions,
  rejectPreferenceSuggestion,
  isSuggestionSuppressed,
} from "../../../preference/suppression-store.js";
import type {
  PreferenceEvidenceReferenceResolverV1,
  PreferenceReaderV1,
  PreferenceSuggestionV1,
  PreferenceSuggestionSuppressionV1,
  PreferenceUsageRecordV1,
} from "../../../preference/types.js";
import {
  signalToSuggestion,
  type PreferenceSignalReader,
} from "../../../agent-task/preference-signal-reader.js";

export class PreferenceSuggestionStore {
  public constructor(
    private readonly ownerId: string,
    private readonly repository: AgentHarnessStateRepository,
  ) {}

  public async refresh(
    reader: PreferenceSignalReader | undefined,
    from: string,
    to: string,
    now: string | number = Date.now(),
  ): Promise<PreferenceSuggestionV1[]> {
    if (!reader) return [];
    const signals = await reader.readAggregateSignals({ ownerId: this.ownerId, from, to });
    const suggestions = signals.flatMap((signal) => {
      if (signal.ownerId !== this.ownerId) return [];
      try {
        return [signalToSuggestion(signal, reader, now)];
      } catch {
        return [];
      }
    });
    if (!suggestions.length) return this.list(reader.evidenceResolver(), now);
    await this.repository.update((state) => {
      for (const suggestion of suggestions) {
        const index = state.preferenceSuggestions.findIndex((item) => item.id === suggestion.id);
        if (index < 0) state.preferenceSuggestions.push(suggestion);
        else {
          const existing = state.preferenceSuggestions[index]!;
          state.preferenceSuggestions[index] = existing.state === "accepted"
            ? {
                ...suggestion, state: "accepted",
                acceptedAt: existing.acceptedAt ?? null,
                acceptedPreferenceId: existing.acceptedPreferenceId ?? null,
              }
            : suggestion;
        }
      }
    });
    return this.list(reader.evidenceResolver(), now);
  }

  public async list(
    evidenceResolver: PreferenceEvidenceReferenceResolverV1,
    now: string | number = Date.now(),
  ): Promise<PreferenceSuggestionV1[]> {
    const current = toEpoch(now);
    return this.repository.read((state) => state.preferenceSuggestions.filter((suggestion) => {
      if (suggestion.ownerId !== this.ownerId || suggestion.state !== "pending") return false;
      if (Date.parse(suggestion.expiresAt) <= current) return false;
      try {
        return !isSuggestionSuppressed(
          suggestion, state.preferenceSuppressions, now, evidenceResolver,
        );
      } catch {
        return false;
      }
    }));
  }

  public async reject(
    suggestionId: string,
    evidenceResolver: PreferenceEvidenceReferenceResolverV1,
    now = new Date().toISOString(),
  ): Promise<void> {
    await this.repository.update((state) => {
      const suggestion = state.preferenceSuggestions.find((item) =>
        item.id === suggestionId && item.ownerId === this.ownerId,
      );
      if (!suggestion) throw new Error("Preference suggestion 不存在");
      const result = rejectPreferenceSuggestion(
        suggestion,
        { ...bindingOf(suggestion), rejectedAt: now },
        evidenceResolver,
        now,
      );
      suggestion.state = result.suggestion.state;
      state.preferenceSuppressions.push(result.suppression);
    });
  }

  public assertPending(suggestionId: string): Promise<PreferenceSuggestionV1> {
    return this.repository.read((state) => {
      const suggestion = state.preferenceSuggestions.find((item) =>
        item.id === suggestionId && item.ownerId === this.ownerId,
      );
      if (!suggestion || suggestion.state !== "pending") {
        throw new Error("Preference suggestion 不存在或已经被消费");
      }
      return suggestion;
    });
  }

  public accept(
    suggestionId: string,
    preferenceId: string,
    now = new Date().toISOString(),
  ): Promise<void> {
    if (!suggestionId.trim() || !preferenceId.trim()) {
      return Promise.reject(new Error("Preference suggestion acceptance binding 无效"));
    }
    return this.repository.update((state) => {
      const suggestion = state.preferenceSuggestions.find((item) =>
        item.id === suggestionId && item.ownerId === this.ownerId,
      );
      if (!suggestion) throw new Error("Preference suggestion 不存在");
      if (suggestion.state === "accepted") {
        if (suggestion.acceptedPreferenceId === preferenceId) return;
        throw new Error("Preference suggestion 已绑定其他 Preference");
      }
      if (suggestion.state !== "pending") throw new Error("只有 pending suggestion 可以被接受");
      suggestion.state = "accepted";
      suggestion.acceptedAt = now;
      suggestion.acceptedPreferenceId = preferenceId;
    }).then(() => undefined);
  }

  public restorePending(
    suggestionId: string,
    preferenceId: string | null,
  ): Promise<void> {
    return this.repository.update((state) => {
      const suggestion = state.preferenceSuggestions.find((item) =>
        item.id === suggestionId && item.ownerId === this.ownerId,
      );
      if (!suggestion || suggestion.state !== "accepted" ||
          suggestion.acceptedPreferenceId !== preferenceId) return;
      suggestion.state = "pending";
      suggestion.acceptedAt = null;
      suggestion.acceptedPreferenceId = null;
    }).then(() => undefined);
  }

  /**
   * Repair the only cross-store crash window in suggestion acceptance.  The
   * suggestion state and Preference outbox live in different durable stores,
   * so a process failure between the two commits can leave an accepted
   * suggestion whose Preference was never created.  Such a reservation is
   * safe to return to pending; an existing Preference remains accepted.
   */
  public async reconcileAccepted(preferences: Pick<PreferenceReaderV1, "getPreference">): Promise<void> {
    const accepted = await this.repository.read((state) => state.preferenceSuggestions.filter((suggestion) =>
      suggestion.ownerId === this.ownerId && suggestion.state === "accepted"));
    for (const suggestion of accepted) {
      const preferenceId = suggestion.acceptedPreferenceId ?? null;
      const preference = preferenceId ? await preferences.getPreference(preferenceId) : null;
      if (!preference) await this.restorePending(suggestion.id, preferenceId);
    }
  }

  public markPresented(suggestionId: string, now = new Date().toISOString()): Promise<void> {
    return this.repository.update((state) => {
      const suggestion = state.preferenceSuggestions.find((item) => item.id === suggestionId && item.ownerId === this.ownerId);
      if (suggestion) suggestion.lastPresentedAt = now;
    }).then(() => undefined);
  }

  public clearSuppressions(): Promise<void> {
    return this.repository.update((state) => {
      state.preferenceSuppressions = state.preferenceSuppressions.filter((item) => item.ownerId !== this.ownerId);
    }).then(() => undefined);
  }

  public recordUse(preferenceId: string, now = new Date().toISOString()): Promise<PreferenceUsageRecordV1> {
    return this.repository.update((state) => {
      state.preferenceUsage = recordPreferenceUsage(
        state.preferenceUsage, this.ownerId, preferenceId, now,
      );
      return preferenceUsageFor(state.preferenceUsage, this.ownerId, preferenceId)!;
    });
  }

  public usage(preferenceId: string): Promise<PreferenceUsageRecordV1 | null> {
    return this.repository.read((state) =>
      preferenceUsageFor(state.preferenceUsage, this.ownerId, preferenceId),
    );
  }

  public activeSuppressions(
    binding: PreferenceSuggestionV1,
    evidenceResolver: PreferenceEvidenceReferenceResolverV1,
    now: string | number = Date.now(),
  ): Promise<PreferenceSuggestionSuppressionV1[]> {
    return this.repository.read((state) => activeSuggestionSuppressions(binding, state.preferenceSuppressions, now, evidenceResolver));
  }
}

function bindingOf(suggestion: PreferenceSuggestionV1) {
  return {
    ownerId: suggestion.ownerId, sessionId: suggestion.sessionId,
    turnId: suggestion.turnId, actionId: suggestion.actionId,
    eventIds: suggestion.eventIds,
  };
}

function toEpoch(value: string | number): number {
  const epoch = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(epoch)) throw new Error("Preference suggestion time 无效");
  return epoch;
}
