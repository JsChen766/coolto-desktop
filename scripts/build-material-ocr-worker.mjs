import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const entries = [
  ["src/desktop/main/material/material-ocr-worker-entry.ts", "out/main/material-ocr-worker.cjs"],
  ["src/desktop/main/material/material-file-repository.ts", "out/main/material-file-repository.cjs"],
];
for (const [entry, outfile] of entries) {
  const output = resolve(outfile);
  await mkdir(dirname(output), { recursive: true });
  await build({
    entryPoints: [resolve(entry)],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    minify: false,
    packages: "external",
    external: ["electron"],
  });
}
