import assert from "node:assert/strict";
import test from "node:test";

import { ResumePdfExportService } from "../src/desktop/main/resume-pdf-export-service.js";
import { ResumePdfExportError } from "../src/resume/export/errors.js";
import type { ResumePdfExportApprovalPayload } from "../src/resume/export/types.js";
import { sha256, stableStringify } from "../src/resume/stable-snapshot.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";

test("save dialog cancellation performs no compile or write", async () => {
  const calls: string[] = [];
  const service = serviceFixture(calls, undefined);
  const result = await service.exportPdf(await payloadFixture());
  assert.deepEqual(result, { status: "cancelled" });
  assert.deepEqual(calls, ["dialog"]);
});

test("desktop PDF export orders dialog, compile, verify, and atomic write", async () => {
  const calls: string[] = [];
  const service = serviceFixture(calls, "/tmp/CV final");
  const result = await service.exportPdf(await payloadFixture());
  assert.equal(result.status, "exported");
  if (result.status === "exported") assert.equal(result.filePath, "/tmp/CV final.pdf");
  assert.deepEqual(calls, ["dialog", "compile", "verify", "write:/tmp/CV final.pdf"]);
});

test("tampered approved structure fails before opening the save dialog", async () => {
  const calls: string[] = [];
  const payload = await payloadFixture();
  payload.structure.sections[0]!.heading = "tampered";
  await assert.rejects(
    serviceFixture(calls, "/tmp/resume.pdf").exportPdf(payload),
    (error: unknown) =>
      error instanceof ResumePdfExportError && error.code === "resume_pdf_payload_changed",
  );
  assert.deepEqual(calls, []);
});

function serviceFixture(calls: string[], path: string | undefined) {
  const compileResultPromise = payloadFixture().then((payload) => payload.compileResult);
  return new ResumePdfExportService(
    {
      compile: async () => compileResultPromise,
      compileForPdf: async () => {
        calls.push("compile");
        return { result: await compileResultPromise, pdf: Buffer.from("valid-pdf") };
      },
    },
    { choosePath: async () => { calls.push("dialog"); return path; } },
    {
      verifyIntegrity: async () => {
        calls.push("verify");
        return postflightFixture();
      },
      writer: { write: async (filePath) => { calls.push(`write:${filePath}`); } },
    },
  );
}

async function payloadFixture(): Promise<ResumePdfExportApprovalPayload> {
  const { proposalBuilder, ready } = await createReadySaveFixture();
  const save = proposalBuilder.build({
    candidateId: ready.candidateId, expectedRevision: ready.revision,
    title: "resume", mode: "new_resume",
  });
  return {
    proposalId: "pdf-1", source: "candidate", title: "resume",
    candidateId: ready.candidateId, candidateRevision: ready.revision,
    suggestedFilename: "resume.pdf",
    structureHash: sha256(stableStringify(save.structured)), structure: save.structured,
    compileResult: ready.compileResult,
  };
}

function postflightFixture() {
  return {
    valid: true, pageCount: 1, widthPoints: 595.28, heightPoints: 841.89,
    isA4Portrait: true, hasTextLayer: true, extractedText: "resume",
    embeddedFontNames: ["SimSun", "TimesNewRoman"], missingFontNames: [],
    cjkFontNames: ["SimSun"], latinFontNames: ["TimesNewRoman"],
    hasTimesNewRoman: true, hasSimSun: true, violations: [],
  };
}
