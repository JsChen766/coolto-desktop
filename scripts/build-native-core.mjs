import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const targetName = process.argv[2];
const targets = {
  "win-x64": {
    platform: "win32",
    arch: "x64",
    triple: "x86_64-pc-windows-msvc",
  },
  "mac-universal": {
    platform: "darwin",
    arch: "arm64",
    triples: ["aarch64-apple-darwin", "x86_64-apple-darwin"],
  },
};
const target = targets[targetName];
if (!target) throw new Error(`Unsupported native target: ${targetName}`);
if (process.platform !== target.platform || process.arch !== target.arch) {
  throw new Error(
    `Native ${targetName} must build on ${target.platform}/${target.arch}; current host is ${process.platform}/${process.arch}`,
  );
}

const root = resolve(import.meta.dirname, "..");
const cargoBin = join(process.env.CARGO_HOME ?? join(homedir(), ".cargo"), "bin");
const cli = join(root, "node_modules", "@napi-rs", "cli", "dist", "cli.js");
const artifactDirectory = join(root, "native", "coolto-core", "artifacts");
const mainKeyHex = randomBytes(32).toString("hex");
mkdirSync(artifactDirectory, { recursive: true });
writeFileSync(join(artifactDirectory, ".main-key"), mainKeyHex, {
  encoding: "ascii",
  mode: 0o600,
});
const buildEnv = {
  ...createBuildEnvironment(),
  COOLTO_MAIN_KEY_HEX: mainKeyHex,
};
const triples = target.triples ?? [target.triple];
for (const triple of triples) {
  run(
    join(cargoBin, process.platform === "win32" ? "rustup.exe" : "rustup"),
    ["target", "add", triple],
  );
  const buildArguments = [
    cli,
    "build",
    "--platform",
    "--release",
    "--target",
    triple,
    "--manifest-path",
    "native/coolto-core/Cargo.toml",
    "--package-json-path",
    "native/coolto-core/package.json",
    "--output-dir",
    "native/coolto-core/artifacts",
  ];
  if (targetName === "mac-universal") buildArguments.splice(4, 0, "--strip");
  run(process.execPath, buildArguments);
}
if (targetName === "mac-universal") {
  run("lipo", [
    "-create",
    "native/coolto-core/artifacts/coolto-core.darwin-arm64.node",
    "native/coolto-core/artifacts/coolto-core.darwin-x64.node",
    "-output",
    "native/coolto-core/artifacts/coolto-core.darwin-universal.node",
  ]);
}
const testTriple = target.triples?.[0] ?? target.triple;
run(join(cargoBin, process.platform === "win32" ? "cargo.exe" : "cargo"), [
  "test",
  "--release",
  "--target",
  testTriple,
  "--manifest-path",
  "native/coolto-core/Cargo.toml",
]);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: buildEnv,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function createBuildEnvironment() {
  const base = {
    ...process.env,
    PATH: `${cargoBin}${delimiter}${process.env.PATH ?? ""}`,
  };
  if (process.platform !== "win32" || process.env.VSCMD_ARG_TGT_ARCH === "x64") {
    return base;
  }
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const vswhere = join(
    programFilesX86,
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  const lookup = spawnSync(vswhere, [
    "-latest",
    "-products",
    "*",
    "-requires",
    "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
    "-property",
    "installationPath",
  ], { encoding: "utf8" });
  const installationPath = lookup.stdout?.trim();
  if (lookup.status !== 0 || !installationPath) {
    throw new Error("Visual Studio C++ Build Tools were not found");
  }
  const devCmd = join(installationPath, "Common7", "Tools", "VsDevCmd.bat");
  const loaded = spawnSync(process.env.ComSpec ?? "cmd.exe", [
    "/d",
    "/c",
    `call "${devCmd}" -arch=x64 -host_arch=x64 >nul && set`,
  ], { encoding: "utf8", env: base, windowsVerbatimArguments: true });
  if (loaded.status !== 0) {
    throw new Error(loaded.stderr || "Failed to load the Visual Studio build environment");
  }
  const vsEnv = Object.fromEntries(
    loaded.stdout.split(/\r?\n/u).flatMap((line) => {
      const separator = line.indexOf("=");
      return separator > 0 ? [[line.slice(0, separator), line.slice(separator + 1)]] : [];
    }),
  );
  return { ...base, ...vsEnv };
}
