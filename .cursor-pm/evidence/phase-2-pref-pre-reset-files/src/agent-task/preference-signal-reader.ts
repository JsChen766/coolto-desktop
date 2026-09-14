import { createPreferenceSuggestion, type PreferenceSuggestionDraftV1 } from "../preference/suggestion-types.js";
import { canonicalHash } from "./canonical-hash.js";
import type { JsonValue } from "./json-types.js";
import type {
  PreferenceEvidenceReferenceResolverV1,
  PreferenceKeyV1,
  PreferenceScopeV1,
  PreferenceSuggestionV1,
  PreferenceSuggestionRationaleCodeV1,
  PreferenceValueV1,
} from "../preference/types.js";

export interface PreferenceAggregateSignalV1 {
  version: 1;
  ownerId: string;
  sessionId: string;
  turnId: string;
  actionId: string;
  eventIds: string[];
  referenceHashes: string[];
  key: PreferenceKeyV1;
  proposedValue: PreferenceValueV1;
  scope: PreferenceScopeV1;
  observationCount: number;
  observationActionCount: number;
  observationWindow: { from: string; to: string };
  confidence: "possible" | "strong";
  rationaleCode: PreferenceSuggestionRationaleCodeV1;
  createdAt: string;
  expiresAt: string;
}

export interface PreferenceSignalReader {
  readAggregateSignals(input: {
    ownerId: string;
    from: string;
    to: string;
  }): Promise<PreferenceAggregateSignalV1[]>;
  evidenceResolver(): PreferenceEvidenceReferenceResolverV1;
}

export function signalToSuggestion(
  signal: PreferenceAggregateSignalV1,
  reader: PreferenceSignalReader,
  now: string | number,
): PreferenceSuggestionV1 {
  const draft: PreferenceSuggestionDraftV1 = {
    id: signalId(signal), ownerId: signal.ownerId,
    sessionId: signal.sessionId, turnId: signal.turnId, actionId: signal.actionId,
    eventIds: signal.eventIds, key: signal.key, proposedValue: signal.proposedValue,
    scope: signal.scope, observationCount: signal.observationCount,
    observationActionCount: signal.observationActionCount,
    observationWindow: signal.observationWindow, confidence: signal.confidence,
    rationale: { code: signal.rationaleCode, referenceHashes: signal.referenceHashes },
    createdAt: signal.createdAt, expiresAt: signal.expiresAt,
  };
  return createPreferenceSuggestion(draft, reader.evidenceResolver(), now);
}

function signalId(signal: PreferenceAggregateSignalV1): string {
  return `suggestion-${canonicalHash({
    ownerId: signal.ownerId, sessionId: signal.sessionId, turnId: signal.turnId,
    actionId: signal.actionId, key: signal.key, proposedValue: signal.proposedValue,
    scope: signal.scope,
  } as unknown as JsonValue)}`;
}

export class DisabledPreferenceSignalReader implements PreferenceSignalReader {
  public async readAggregateSignals(): Promise<PreferenceAggregateSignalV1[]> {
    return [];
  }

  public evidenceResolver(): PreferenceEvidenceReferenceResolverV1 {
    return { resolve: () => null };
  }
}
