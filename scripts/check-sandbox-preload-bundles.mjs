import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve("out/preload");
const entries = new Set([
  "browser-agent-inspector.cjs",
  "browser-download-popover.cjs",
  "browser-shell.cjs",
  "index.cjs",
  "material-feature.cjs",
  "resume.cjs",
]);
const files = (await readdir(directory)).filter((file) => file.endsWith(".cjs"));
const extras = files.filter((file) => !entries.has(file));
if (extras.length > 0) {
  throw new Error(`Sandbox preload build emitted shared chunks: ${extras.join(", ")}`);
}
for (const entry of entries) {
  const source = await readFile(resolve(directory, entry), "utf8");
  if (/require\(["']\.\.?\//u.test(source)) {
    throw new Error(`Sandbox preload ${entry} contains an unsupported local require()`);
  }
}
process.stdout.write(`Sandbox preload bundles are standalone: ${entries.size} entries.\n`);
