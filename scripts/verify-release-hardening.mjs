import { access, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { extractFile, listPackage } from "@electron/asar";
import { FuseV1Options, getCurrentFuseWire } from "@electron/fuses";

const appPath = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Usage: verify-release-hardening <app-path>");

const isMac = appPath.endsWith(".app");
const resources = isMac
  ? join(appPath, "Contents", "Resources")
  : join(appPath, "resources");
const executable = isMac
  ? join(appPath, "Contents", "MacOS", basename(appPath, ".app"))
  : join(appPath, "Coolto.exe");
const asarPath = join(resources, "app.asar");
const nativePath = join(resources, "native", "coolto-core.node");

await Promise.all([access(executable), access(asarPath), access(nativePath)]);
const files = await listPackage(asarPath);
const normalized = files.map((file) =>
  file.replaceAll("\\", "/").replace(/^\/+/, ""),
);
if (isMac) {
  requireFile(normalized, "out/main/index.arm64.cjsc");
  requireFile(normalized, "out/main/index.x64.cjsc");
  assertProtectedBytecode(extractFile(asarPath, archivePath("index.arm64.cjsc")));
  assertProtectedBytecode(extractFile(asarPath, archivePath("index.x64.cjsc")));
} else {
  requireFile(normalized, "out/main/index.cjsc");
  assertProtectedBytecode(extractFile(asarPath, archivePath("index.cjsc")));
}
requireFile(normalized, "out/main/index.cjs");
requireFile(normalized, "out/main/bytecode-loader.cjs");

const forbidden = normalized.filter(
  (file) =>
    !file.startsWith("node_modules/") &&
    (/(^|\/)\.(env|git)(\.|\/|$)/u.test(file) ||
      /\.(map|ts|tsx|vue)$/u.test(file) ||
      /(^|\/)(test|tests|local-docs|scripts)(\/|$)/u.test(file)),
);
if (forbidden.length) {
  throw new Error(`Release contains forbidden files:\n${forbidden.join("\n")}`);
}

const entry = extractFile(asarPath, archivePath("index.cjs"));
const loader = extractFile(asarPath, archivePath("bytecode-loader.cjs"));
if (entry.byteLength > 512 || loader.byteLength > 16_384) {
  throw new Error("Main-process bytecode loader is unexpectedly large");
}
const nativeSize = (await stat(nativePath)).size;
if (nativeSize < 10_000) throw new Error("Native protection module is unexpectedly small");

const fuses = await getCurrentFuseWire(executable);
const enabled = 49;
const disabled = 48;
const expected = new Map([
  [FuseV1Options.RunAsNode, disabled],
  [FuseV1Options.EnableCookieEncryption, enabled],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, disabled],
  [FuseV1Options.EnableNodeCliInspectArguments, disabled],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, enabled],
  [FuseV1Options.OnlyLoadAppFromAsar, enabled],
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, disabled],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, enabled],
]);
for (const [fuse, state] of expected) {
  if (fuses[fuse] !== state) {
    throw new Error(`Unexpected fuse state for ${FuseV1Options[fuse]}`);
  }
}

const sourceMaps = await findFiles(appPath, ".map");
if (sourceMaps.length) {
  throw new Error(`Release contains source maps:\n${sourceMaps.join("\n")}`);
}
process.stdout.write(
  `${JSON.stringify({ appPath, asarFiles: files.length, entryBytes: entry.byteLength, loaderBytes: loader.byteLength, nativeBytes: nativeSize, fuses: "verified" }, null, 2)}\n`,
);

function requireFile(files, expectedPath) {
  if (!files.includes(expectedPath)) throw new Error(`Missing ${expectedPath}`);
}

function archivePath(fileName) {
  return join("out", "main", fileName);
}

function assertProtectedBytecode(bytecode) {
  const markers = [
    "你是 Coolto 桌面端的本地求职 Agent",
    "生成简历采用 Agent 全编排流程",
  ];
  for (const marker of markers) {
    if (bytecode.includes(Buffer.from(marker, "utf8"))) {
      throw new Error("Protected Agent prompt remains readable in bytecode");
    }
  }
}

async function findFiles(root, suffix) {
  const { readdir } = await import("node:fs/promises");
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await findFiles(path, suffix)));
    else if (entry.name.endsWith(suffix)) found.push(path);
  }
  return found;
}
