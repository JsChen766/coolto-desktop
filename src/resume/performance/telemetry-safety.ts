import type { ResumeGenerationTrace } from "./trace-types.js";

const FORBIDDEN_PROPERTY_NAMES = new Set([
  "arguments",
  "content",
  "email",
  "fullName",
  "message",
  "phone",
  "prompt",
  "sourceQuote",
  "text",
]);

export function assertTraceIsMetadataOnly(trace: ResumeGenerationTrace): void {
  const serialized = JSON.stringify(trace);
  for (const propertyName of FORBIDDEN_PROPERTY_NAMES) {
    if (serialized.includes(`\"${propertyName}\"`)) {
      throw new Error(`Telemetry must not contain ${propertyName}`);
    }
  }
}

export function assertTraceExcludesValues(
  trace: ResumeGenerationTrace,
  sensitiveValues: readonly string[],
): void {
  const serialized = JSON.stringify(trace);
  for (const value of sensitiveValues) {
    if (value && serialized.includes(value)) {
      throw new Error("Telemetry contains a supplied sensitive value");
    }
  }
}
