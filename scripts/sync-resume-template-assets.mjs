import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = path.resolve(
  process.env.CV_AGENT_BACKEND_ROOT ?? path.join(appRoot, "..", "cv-agent-be"),
);
const webRoot = path.resolve(
  process.env.CV_AGENT_FRONTEND_ROOT ??
    path.join(appRoot, "..", "cv-agent-app"),
);
const checkOnly = process.argv.includes("--check");

const runtimeRoot = path.join(
  appRoot,
  "src",
  "desktop",
  "renderer",
  "src",
  "resume",
  "template",
);
const referenceRoot = path.join(
  appRoot,
  "resources",
  "resume-template",
  "web-reference",
);
const lockPath = path.join(
  appRoot,
  "resources",
  "resume-template",
  "source-lock.json",
);

const files = [
  {
    source: path.join(
      backendRoot,
      "contracts",
      "resume-layout-templates-v1.json",
    ),
    target: path.join(runtimeRoot, "resume-layout-templates-v1.json"),
    origin: "cv-agent-be/contracts/resume-layout-templates-v1.json",
  },
  {
    source: path.join(backendRoot, "app", "infra", "layout", "fonts", "simsun.ttc"),
    target: path.join(runtimeRoot, "fonts", "simsun.ttc"),
    origin: "cv-agent-be/app/infra/layout/fonts/simsun.ttc",
  },
  {
    source: path.join(backendRoot, "app", "infra", "layout", "fonts", "times.ttf"),
    target: path.join(runtimeRoot, "fonts", "times.ttf"),
    origin: "cv-agent-be/app/infra/layout/fonts/times.ttf",
  },
  ...[
    ["src/components/ResumeDocument.vue", "ResumeDocument.vue.source"],
    ["src/utils/resume-template-manifest.ts", "resume-template-manifest.ts.source"],
    ["src/utils/resume-layout-profile.ts", "resume-layout-profile.ts.source"],
    ["src/utils/resume-dom-measurement.ts", "resume-dom-measurement.ts.source"],
    ["src/utils/resume-section-order.ts", "resume-section-order.ts.source"],
    ["src/utils/structured-content.ts", "structured-content.ts.source"],
    ["src/types/generated-content.ts", "generated-content.ts.source"],
    ["src/api/resumes.ts", "resumes-api.ts.source"],
  ].map(([source, target]) => ({
    source: path.join(webRoot, source),
    target: path.join(referenceRoot, target),
    origin: `cv-agent-app/${source}`,
  })),
];

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function exists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function loadJson(candidate) {
  return JSON.parse(await readFile(candidate, "utf8"));
}

async function validateManifestAndFonts() {
  const appManifestPath = path.join(
    runtimeRoot,
    "resume-layout-templates-v1.json",
  );
  const appManifest = await loadJson(appManifestPath);
  assert.equal(appManifest.schema_version, "resume-layout-templates-v1");
  const standard = appManifest.templates.find(
    (template) => template.template_id === "resume-standard",
  );
  const sparse = appManifest.templates.find(
    (template) => template.template_id === "resume-sparse",
  );
  assert.ok(standard, "App resume manifest is missing resume-standard");
  assert.ok(sparse, "App resume manifest is missing resume-sparse");

  const [appSimSun, appTimes] = await Promise.all([
    readFile(path.join(runtimeRoot, "fonts", "simsun.ttc")),
    readFile(path.join(runtimeRoot, "fonts", "times.ttf")),
  ]);
  assert.equal(
    digest(appSimSun),
    standard.fonts.chinese.checksum_sha256,
    "App SimSun font drifted from the template manifest",
  );
  assert.equal(
    digest(appTimes),
    standard.fonts.english.checksum_sha256,
    "App Times New Roman font drifted from the template manifest",
  );

  const webSimSunPath = path.join(webRoot, "src", "static", "fonts", "simsun.ttc");
  const webTimesPath = path.join(webRoot, "src", "static", "fonts", "times.ttf");
  if (await exists(webSimSunPath)) {
    assert.equal(
      digest(await readFile(webSimSunPath)),
      digest(appSimSun),
      "App SimSun font drifted from the Web renderer font",
    );
  }
  if (await exists(webTimesPath)) {
    assert.equal(
      digest(await readFile(webTimesPath)),
      digest(appTimes),
      "App Times New Roman font drifted from the Web renderer font",
    );
  }

  const backendManifestPath = path.join(
    backendRoot,
    "contracts",
    "resume-layout-templates-v1.json",
  );
  const webManifestPath = path.join(
    webRoot,
    "src",
    "resume-layout-templates-v1.json",
  );
  if (await exists(backendManifestPath)) {
    assert.deepEqual(
      appManifest,
      await loadJson(backendManifestPath),
      "App resume manifest drifted from the backend contract",
    );
  }
  if (await exists(webManifestPath)) {
    assert.deepEqual(
      appManifest,
      await loadJson(webManifestPath),
      "App resume manifest drifted from the Web renderer contract",
    );
  }
}

async function synchronize() {
  const lockFiles = [];
  for (const file of files) {
    await mkdir(path.dirname(file.target), { recursive: true });
    await copyFile(file.source, file.target);
    const content = await readFile(file.target);
    lockFiles.push({
      origin: file.origin,
      target: path.relative(appRoot, file.target),
      sha256: digest(content),
      size: content.byteLength,
    });
  }
  await mkdir(path.dirname(lockPath), { recursive: true });
  await writeFile(
    lockPath,
    `${JSON.stringify(
      {
        schema_version: "coolto-resume-template-source-lock-v1",
        backend_manifest_schema: "resume-layout-templates-v1",
        files: lockFiles,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function verifyLock() {
  const lock = await loadJson(lockPath);
  assert.equal(
    lock.schema_version,
    "coolto-resume-template-source-lock-v1",
  );
  for (const entry of lock.files) {
    const target = path.join(appRoot, entry.target);
    const content = await readFile(target);
    assert.equal(
      digest(content),
      entry.sha256,
      `Copied resume template asset drifted: ${entry.target}`,
    );
    assert.equal(
      content.byteLength,
      entry.size,
      `Copied resume template asset size drifted: ${entry.target}`,
    );
    const source = files.find((file) => file.origin === entry.origin)?.source;
    if (source && (await exists(source))) {
      assert.equal(
        digest(await readFile(source)),
        entry.sha256,
        `Resume source changed; run npm run sync:resume-template (${entry.origin})`,
      );
    }
  }
}

if (!checkOnly) {
  await synchronize();
}
await verifyLock();
await validateManifestAndFonts();

console.log(
  checkOnly
    ? "Resume storage/rendering template snapshot is synchronized."
    : "Resume storage/rendering template snapshot copied and verified.",
);
