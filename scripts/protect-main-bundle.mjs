import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const artifactDirectory = join(root, "native", "coolto-core", "artifacts");
const nativeFile =
  process.platform === "win32"
    ? "coolto-core.win32-x64-msvc.node"
    : process.platform === "darwin"
      ? "coolto-core.darwin-universal.node"
      : undefined;
if (!nativeFile) throw new Error(`Unsupported release platform: ${process.platform}`);

const mainDirectory = join(root, "out", "main");
const entryPath = join(mainDirectory, "index.cjs");
const payloadPath = join(mainDirectory, "index.bin");
const keyHex = (await readFile(join(artifactDirectory, ".main-key"), "ascii")).trim();
if (!/^[a-f\d]{64}$/u.test(keyHex)) throw new Error("Invalid native main key");

const [source, nativeModule] = await Promise.all([
  readFile(entryPath),
  readFile(join(artifactDirectory, nativeFile)),
]);
assertNoImportOnlyRequires(source);
const nonce = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), nonce);
const encrypted = Buffer.concat([cipher.update(source), cipher.final(), cipher.getAuthTag()]);
const payload = Buffer.concat([Buffer.from("CLTOENC1", "ascii"), nonce, encrypted]);
const nativeSha256 = createHash("sha256").update(nativeModule).digest("hex");

await Promise.all([
  writeFile(payloadPath, payload),
  writeFile(entryPath, createLoader(nativeSha256)),
]);

function createLoader(expectedNativeSha256) {
  const contextKey = `__coolto_${randomBytes(12).toString("hex")}`;
  return `"use strict";
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const nativePath = join(process.resourcesPath, "native", "coolto-core.node");
const nativeBytes = readFileSync(nativePath);
const nativeSha256 = createHash("sha256").update(nativeBytes).digest("hex");
if (nativeSha256 !== "${expectedNativeSha256}") throw new Error("原生保护模块完整性校验失败");
const binding = require(nativePath);
if (typeof binding.runProtectedMain !== "function") throw new Error("原生保护模块接口无效");
const payload = readFileSync(join(__dirname, "index.bin"));
const filename = join(__dirname, "protected-main.cjs");
globalThis.${contextKey} = { module, require, filename, dirname: __dirname };
try { binding.runProtectedMain(payload, "${contextKey}"); }
finally { delete globalThis.${contextKey}; }
if (process.env.COOLTO_INSTALLER_SMOKE === "1") process.stdout.write("COOLTO_MAIN_BOOTSTRAP_READY\\n");
`;
}

function assertNoImportOnlyRequires(source) {
  const importOnlyPackages = [
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
  ];
  const text = source.toString("utf8");
  for (const packageName of importOnlyPackages) {
    const rootRequire = `require("${packageName}")`;
    const subpathRequire = `require("${packageName}/`;
    if (text.includes(rootRequire) || text.includes(subpathRequire)) {
      throw new Error(`Import-only dependency was externalized as CommonJS: ${packageName}`);
    }
  }
}
