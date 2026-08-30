import assert from "node:assert/strict";
import test from "node:test";

import type { BrowserPageOperator } from "../src/browser/types.js";
import type {
  DeliveryResumeFile,
  DeliveryResumeFileStore,
} from "../src/delivery-resume-files/types.js";
import { createDeliveryResumeFileTools } from
  "../src/tools/delivery-resume-file-tools.js";
import { requireToolCapability } from "../src/tools/tool-capabilities.js";
import { createToolRegistry } from "../src/tools/registry.js";
import { createLocalFileTools } from "../src/tools/local-file-tools.js";
import type { SelectedFileRegistry } from
  "../src/files/selected-file-registry.js";

const file: DeliveryResumeFile = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "用户投递简历",
  originalFilename: "resume.pdf",
  type: "pdf",
  mimeType: "application/pdf",
  sizeBytes: 100,
  sha256: "a".repeat(64),
  preferred: true,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
};

test("delivery file tools select any user file without resume-writing tools", async () => {
  const selected: string[] = [];
  const source = fakeSource(selected);
  const tools = createToolRegistry({ deliveryResumeFiles: source });
  assert.deepEqual(tools.map((tool) => tool.name), [
    "get_runtime_info",
    "list_delivery_resume_files",
    "select_delivery_resume_file",
  ]);
  assert.deepEqual(
    requireToolCapability(tools[1]!).requiredScopes,
    ["delivery_resume_file.read"],
  );
  const result = await tools[2]!.execute("select", { fileId: file.id });
  assert.deepEqual(selected, [file.id]);
  assert.match(result.content[0]?.type === "text" ? result.content[0].text : "", /任意岗位/u);
});

test("browser delivery upload resolves a host path without exposing it", async () => {
  let paths: readonly string[] | undefined;
  const source = fakeSource([]);
  const browser = {
    checkWriteAccess: () => ({ ok: true as const }),
    uploadFile: async (_fillId: string, registered?: readonly string[]) => {
      paths = registered;
      return { cancelled: false as const, filenames: ["resume.pdf"], fileCount: 1 };
    },
  } as BrowserPageOperator;
  const tool = createDeliveryResumeFileTools(source, browser)
    .find((item) => item.name === "browser_upload_delivery_resume")!;
  const result = await tool.execute("upload", { fileId: file.id, fillId: "file-1" });

  assert.deepEqual(paths, ["/host-only/staged-resume.pdf"]);
  assert.doesNotMatch(JSON.stringify(result), /host-only/u);
  assert.equal((result.details as { sha256: string }).sha256, file.sha256);
});

test("a newly attached file can be saved unchanged as a delivery resume", async () => {
  const imported: Array<{ filename: string; content: Uint8Array }> = [];
  const source = {
    ...fakeSource([]),
    importContent: async (filename: string, content: Uint8Array) => {
      imported.push({ filename, content });
      return file;
    },
  };
  const selectedFiles = {
    read: async () => ({
      metadata: {
        id: "attachment-1",
        filename: "resume.pdf",
        type: "pdf" as const,
        sizeBytes: 16,
      },
      content: Buffer.from("%PDF-1.7\n%%EOF"),
    }),
  } as unknown as SelectedFileRegistry;
  const tool = createLocalFileTools({
    selectedFileRegistry: selectedFiles,
    deliveryResumeFiles: source,
  }).find((item) => item.name === "save_selected_file_as_delivery_resume");

  assert.ok(tool, "missing attachment-to-delivery-file bridge tool");
  const result = await tool.execute("save", { fileId: "attachment-1" });
  assert.equal(imported[0]?.filename, "resume.pdf");
  assert.deepEqual(imported[0]?.content, Buffer.from("%PDF-1.7\n%%EOF"));
  assert.match(result.content[0]?.type === "text" ? result.content[0].text : "", /原样保存/u);
});

function fakeSource(selected: string[]): DeliveryResumeFileStore {
  return {
    list: async () => [file],
    get: async () => file,
    setPreferred: async (fileId) => {
      selected.push(fileId);
      return file;
    },
    stage: async () => "/host-only/staged-resume.pdf",
    importContent: async () => file,
  };
}
