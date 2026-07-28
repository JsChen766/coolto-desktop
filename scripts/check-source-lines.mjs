import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_EXTENSIONS = new Set([".css", ".ts", ".vue"]);
const MAX_LINES = 250;
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(repositoryRoot, "src");

const files = await collectSourceFiles(sourceRoot);
const violations = [];

for (const path of files) {
  const content = await readFile(path, "utf8");
  const lines = countLines(content);
  if (lines > MAX_LINES) {
    violations.push(`${relative(repositoryRoot, path)}: ${lines} lines`);
  }
  if (/^logdir: .*Operation not permitted$/mu.test(content)) {
    violations.push(`${relative(repositoryRoot, path)}: contains shell log output`);
  }
}

if (violations.length > 0) {
  console.error(`Source policy failed (hard limit: ${MAX_LINES} lines):`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(
    `Source policy passed: ${files.length} files, each <= ${MAX_LINES} lines.`,
  );
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(path);
      return entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))
        ? [path]
        : [];
    }),
  );
  return nested.flat().sort();
}

function countLines(content) {
  if (content.length === 0) return 0;
  const normalized = content.replace(/\r\n?/gu, "\n");
  const lines = normalized.split("\n").length;
  return normalized.endsWith("\n") ? lines - 1 : lines;
}
