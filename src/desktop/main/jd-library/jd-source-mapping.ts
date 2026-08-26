import type { JdCreateInput } from "../../../api/types.js";
import {
  JD_SOURCE_KINDS,
  normalizeJdSourceUrl,
  type JdSourceKind,
} from "../../../jd/source.js";

export function jdSourceFields(input: JdCreateInput): {
  kind: JdSourceKind;
  url: string | null;
} {
  return {
    kind: input.sourceKind ?? "pasted",
    url: normalizeJdSourceUrl(input.sourceUrl),
  };
}

export function mappedJdSourceKind(value: unknown): JdSourceKind {
  return typeof value === "string" &&
      JD_SOURCE_KINDS.includes(value as JdSourceKind)
    ? value as JdSourceKind
    : "manual";
}
