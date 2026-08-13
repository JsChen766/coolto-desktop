import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL(
  "../src/desktop/renderer/src/resume/template/",
  import.meta.url,
);
const referenceRoot = new URL(
  "../resources/resume-template/web-reference/",
  import.meta.url,
);

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

test("copied resume manifest pins the exact backend profiles", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("resume-layout-templates-v1.json", templateRoot),
      "utf8",
    ),
  ) as {
    schema_version: string;
    templates: Array<{
      template_id: string;
      profile_version: string;
      profile_hash: string;
      page: { width_mm: number; height_mm: number; orientation: string };
      content: { width_mm: number; height_mm: number };
      bullet: { gate_ratio: number };
      fonts: {
        chinese: { checksum_sha256: string };
        english: { checksum_sha256: string };
      };
    }>;
  };
  assert.equal(manifest.schema_version, "resume-layout-templates-v1");
  const standard = manifest.templates.find(
    (template) => template.template_id === "resume-standard",
  );
  const sparse = manifest.templates.find(
    (template) => template.template_id === "resume-sparse",
  );
  assert.ok(standard);
  assert.ok(sparse);
  assert.equal(standard.profile_version, "resume-template-v2");
  assert.equal(
    standard.profile_hash,
    "130b516b3eb2f0a5a335ff525eebd3ca43dcce1053ab02a06d384e3a18f09fc0",
  );
  assert.deepEqual(standard.page, {
    width_mm: 210,
    height_mm: 297,
    orientation: "portrait",
  });
  assert.deepEqual(standard.content, { width_mm: 192, height_mm: 279 });
  assert.equal(standard.bullet.gate_ratio, 0.7);
  assert.equal(sparse.profile_version, "resume-sparse-v1");
});

test("copied font binaries match the manifest checksums", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("resume-layout-templates-v1.json", templateRoot),
      "utf8",
    ),
  ) as {
    templates: Array<{
      template_id: string;
      fonts: {
        chinese: { checksum_sha256: string };
        english: { checksum_sha256: string };
      };
    }>;
  };
  const standard = manifest.templates.find(
    (template) => template.template_id === "resume-standard",
  );
  assert.ok(standard);
  const [simSun, times] = await Promise.all([
    readFile(new URL("fonts/simsun.ttc", templateRoot)),
    readFile(new URL("fonts/times.ttf", templateRoot)),
  ]);
  assert.equal(sha256(simSun), standard.fonts.chinese.checksum_sha256);
  assert.equal(sha256(times), standard.fonts.english.checksum_sha256);
});

test("Web renderer snapshot preserves the canonical DOM and CSS contract", async () => {
  const [component, loader, measurement] = await Promise.all([
    readFile(new URL("ResumeDocument.vue.source", referenceRoot), "utf8"),
    readFile(
      new URL("resume-template-manifest.ts.source", referenceRoot),
      "utf8",
    ),
    readFile(
      new URL("resume-dom-measurement.ts.source", referenceRoot),
      "utf8",
    ),
  ]);
  assert.match(component, /data-resume-renderer="resume-document-v1"/);
  assert.match(component, /class="resume-document-page"/);
  assert.match(component, /:data-section-id="section\.id"/);
  assert.match(component, /:data-item-id="item\.id"/);
  assert.match(component, /:data-bullet-id="bullet\.id"/);
  assert.match(component, /font-family: 'Times New Roman', 'SimSun', serif/);
  assert.match(component, /width: var\(--resume-page-width\)/);
  assert.match(loader, /--resume-content-height/);
  assert.match(loader, /--resume-bullet-marker-width/);
  assert.match(measurement, /document\.createRange\(\)/);
  assert.match(measurement, /range\.getClientRects\(\)/);
  assert.match(
    measurement,
    /lastLineRatio \+ Number\.EPSILON >= gateRatio/,
  );
});

