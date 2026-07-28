export class ApiContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ApiContractError";
  }
}

export function objectValue(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiContractError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function optionalObject(
  value: unknown,
  path: string,
): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  return objectValue(value, path);
}

export function arrayValue(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ApiContractError(`${path} must be an array`);
  }
  return value;
}

export function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiContractError(`${path} must be a non-empty string`);
  }
  return value;
}

export function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ApiContractError(`${path} must be a string or null`);
  }
  return value;
}

export function nullableNumber(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiContractError(`${path} must be a finite number or null`);
  }
  return value;
}

export function requiredPositiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ApiContractError(`${path} must be a positive integer`);
  }
  return value;
}

export function stringArray(value: unknown, path: string): string[] {
  const array = arrayValue(value, path);
  if (array.some((item) => typeof item !== "string")) {
    throw new ApiContractError(`${path} must contain only strings`);
  }
  return array as string[];
}
