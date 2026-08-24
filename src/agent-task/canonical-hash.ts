import { createHash } from "node:crypto";

import type { JsonValue } from "./json-types.js";

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON rejects non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`,
  );
  return `{${entries.join(",")}}`;
}

export function canonicalHash(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
