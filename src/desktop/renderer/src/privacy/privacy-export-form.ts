import type {
  PrivacyExportOptions,
  PrivacyExportResult,
} from "../../../shared/types/privacy.js";

export interface PrivacyExportFormInput {
  passphrase: unknown;
  confirmation: unknown;
}

export interface PrivacyExportSubmission {
  values: PrivacyExportFormInput;
  options: Omit<PrivacyExportOptions, "passphrase">;
  reset(): void;
  exportData(options: PrivacyExportOptions): Promise<PrivacyExportResult>;
}

export async function submitPrivacyExport(
  input: PrivacyExportSubmission,
): Promise<PrivacyExportResult> {
  const passphrase = stringValue(input.values.passphrase);
  const confirmation = stringValue(input.values.confirmation);
  if (passphrase.length < 8 || passphrase.length > 512) {
    throw new Error("导出密码长度必须为 8–512 个字符");
  }
  if (passphrase !== confirmation) {
    throw new Error("两次输入的导出密码不一致");
  }
  input.reset();
  try {
    return await input.exportData({ ...input.options, passphrase });
  } catch (error: unknown) {
    throw new Error(redactExportError(error, [passphrase, confirmation]));
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function redactExportError(error: unknown, secrets: readonly string[]): string {
  const message = error instanceof Error ? error.message : "导出失败，请重试";
  return secrets.some((secret) => secret.length > 0 && message.includes(secret))
    ? "导出失败，请重试"
    : message;
}
