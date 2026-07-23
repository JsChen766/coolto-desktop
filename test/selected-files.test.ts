import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseCliArguments } from "../src/cli/args.js";
import { parseSelectedFile } from "../src/files/parse-selected-file.js";
import { SelectedFileRegistry } from "../src/files/selected-file-registry.js";

test("CLI separates explicit attachments from natural-language input", () => {
  assert.deepEqual(
    parseCliArguments([
      "--attach",
      "/tmp/resume.pdf",
      "--attach=/tmp/history.docx",
      "请导入这些经历",
    ]),
    {
      prompt: "请导入这些经历",
      attachmentPaths: ["/tmp/resume.pdf", "/tmp/history.docx"],
    },
  );
});

test("selected file registry only reads explicitly registered text files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-import-"));
  const path = join(directory, "experience.txt");
  await writeFile(path, "AI Engineer\nBuilt a local agent.", "utf8");

  try {
    const registry = new SelectedFileRegistry();
    const [metadata] = await registry.registerPaths([path]);
    assert.equal(metadata?.filename, "experience.txt");

    const parsed = await parseSelectedFile(
      await registry.read(metadata!.id),
    );
    assert.match(parsed.text, /Built a local agent/);
    await assert.rejects(
      registry.read("attachment-not-selected"),
      /明确选择/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("DOCX parser extracts local text", async () => {
  const fixturePath = join(
    process.cwd(),
    "node_modules/mammoth/test/test-data/single-paragraph.docx",
  );
  const parsed = await parseSelectedFile({
    metadata: {
      id: "attachment-docx",
      filename: "single-paragraph.docx",
      type: "docx",
      sizeBytes: (await readFile(fixturePath)).byteLength,
    },
    content: await readFile(fixturePath),
  });

  assert.match(parsed.text, /Walking on imported air/);
});
