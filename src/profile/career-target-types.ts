/** Local projection row identity; cross-sync identity is the target fingerprint. */
export type CareerTargetIdKindV1 = "opaque" | "legacy_compatibility";

export interface CareerTargetV1 {
  id: string;
  idKind: CareerTargetIdKindV1;
  role: string | null;
  industries: string[];
  locations: string[];
  isPrimary: boolean;
}
