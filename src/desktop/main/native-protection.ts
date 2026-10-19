import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { app } from "electron";

import {
  installProtectedQualityCore,
  type ProtectedQualityCore,
} from "../../resume/quality/protected-core.js";

declare const __COOLTO_NATIVE_CORE_SHA256__: string;

export interface CooltoNativeCore extends ProtectedQualityCore {
  calendarAuthorizationStatus?: () => string;
  calendarRequestAccess?: (level: "write_only" | "full_access") => Promise<string>;
  calendarCreateEvent?: (input: string) => Promise<string>;
  calendarUpdateEvent?: (input: string) => Promise<string>;
  calendarCancelEvent?: (eventIdentifier: string) => Promise<string>;
}

let activeNativeCore: CooltoNativeCore | undefined;

export function initializeNativeProtection(): void {
  const bindingPath = app.isPackaged
    ? join(process.resourcesPath, "native", "coolto-core.node")
    : developmentBindingPath();
  // OSS Linux AppImage ships no coolto-core (electron-builder.yml has no linux
  // native extraResources; native:build only targets win/mac). Skip rather than
  // fail packaged startup on a missing binding / empty compile-time hash.
  if (!bindingPath || !existsSync(bindingPath)) return;
  verifyBinding(bindingPath, app.isPackaged);
  const require = createRequire(join(process.cwd(), "package.json"));
  const binding = require(bindingPath) as CooltoNativeCore;
  validateBinding(binding);
  activeNativeCore = binding;
  installProtectedQualityCore(binding);
}

export function nativeCore(): CooltoNativeCore | undefined {
  return activeNativeCore;
}

function verifyBinding(path: string, required: boolean): void {
  const expected = __COOLTO_NATIVE_CORE_SHA256__;
  if (!expected) {
    if (required) throw new Error("正式包缺少原生保护模块哈希");
    return;
  }
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== expected) throw new Error("原生保护模块完整性校验失败");
}

function validateBinding(value: ProtectedQualityCore): void {
  if (
    typeof value?.weightedQualityScore !== "function" ||
    typeof value?.bulletSimilarity !== "function"
  ) {
    throw new Error("原生保护模块接口无效");
  }
}

function developmentBindingPath(): string | undefined {
  const suffix =
    process.platform === "win32" && process.arch === "x64"
      ? "win32-x64-msvc"
      : process.platform === "darwin" && process.arch === "arm64"
        ? "darwin-universal"
        : undefined;
  return suffix
    ? join(process.cwd(), "native", "coolto-core", "artifacts", `coolto-core.${suffix}.node`)
    : undefined;
}
