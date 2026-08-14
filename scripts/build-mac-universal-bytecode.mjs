import { mkdtemp, readFile, rm, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import { downloadArtifact } from "@electron/get";

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("Universal bytecode must build on Apple Silicon macOS");
}
const root = resolve(import.meta.dirname, "..");
const mainDir = join(root, "out", "main");
const arm64Bytecode = join(mainDir, "index.arm64.cjsc");
const x64Bytecode = join(mainDir, "index.x64.cjsc");

run("npm", ["run", "desktop:build"]);
const arm64 = await readFile(join(mainDir, "index.cjsc"));

const require = createRequire(import.meta.url);
const electronVersion = require("electron/package.json").version;
const zip = await downloadArtifact({
  version: electronVersion,
  platform: "darwin",
  arch: "x64",
  artifactName: "electron",
});
const extracted = await mkdtemp(join(tmpdir(), "coolto-electron-x64-"));
try {
  run("ditto", ["-x", "-k", zip, extracted]);
  run("npm", ["run", "desktop:build"], {
    ELECTRON_EXEC_PATH: join(
      extracted,
      "Electron.app",
      "Contents",
      "MacOS",
      "Electron",
    ),
  });
  await rename(join(mainDir, "index.cjsc"), x64Bytecode);
  await writeFile(arm64Bytecode, arm64);
  await writeFile(
    join(mainDir, "index.cjs"),
    '"use strict";\nrequire("./bytecode-loader.cjs");\nrequire(`./index.${process.arch}.cjsc`);\n',
  );
} finally {
  await rm(extracted, { recursive: true, force: true });
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
