import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";

async function bootstrap() {
  const bundled = process.env.COOLTO_MAT_ACCEPTANCE_BUNDLED === "1";
  if (!bundled) {
    const root = await mkdtemp(join(tmpdir(), "coolto-material-electron-"));
    try {
      const outfile = resolve("out/cli/material-product-acceptance.cjs");
      await build({ entryPoints: [fileURLToPath(import.meta.url)], outfile, bundle: true, platform: "node", format: "cjs", target: "node22", define: { "import.meta.url": "__filename" }, external: ["electron", "esbuild", "@napi-rs/canvas", "@napi-rs/keyring", "tesseract.js", "pdfjs-dist"] });
      const require = createRequire(import.meta.url);
      const electronBinary = process.env.ELECTRON_BIN ?? require("electron");
      const child = spawn(electronBinary, [outfile], { cwd: process.cwd(), env: { ...process.env, COOLTO_MAT_ACCEPTANCE_BUNDLED: "1", COOLTO_MAT_ACCEPTANCE_ROOT: root }, stdio: "inherit" });
      const [code, signal] = await new Promise((resolveResult) => child.once("exit", (exitCode, exitSignal) => resolveResult([exitCode, exitSignal])));
      if (signal) throw new Error(`Material acceptance exited by ${signal}`);
      process.exitCode = code ?? 1;
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  } else {
    await runAcceptance();
  }
}
void bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});

async function runAcceptance() {
  const { app, dialog } = await import("electron");
  const { createCanvas } = await import("@napi-rs/canvas");
  const { SelectedFileRegistry } = await import("../src/files/selected-file-registry.ts");
  const { RegistryMaterialFileBoundary } = await import("../src/material/material-file-boundary.ts");
  const { MaterialImportService } = await import("../src/material/material-import-service.ts");
  const { MaterialOcrService } = await import("../src/material/material-ocr-service.ts");
  const { MaterialProposalService } = await import("../src/material/material-proposal-service.ts");
  const { MaterialDeleteImpactService } = await import("../src/material/material-delete-impact.ts");
  const { MaterialExportService } = await import("../src/material/material-export.ts");
  const { MaterialViewService } = await import("../src/material/material-view.ts");
  const { inspectMaterialOcrResources } = await import("../src/desktop/main/material/material-ocr-resources.ts");
  const { createMaterialHostPort } = await import("../src/material/material-host-contract.ts");
  const { createMaterialToolAdapter } = await import("../src/material/material-tool-adapter.ts");
  const { MaterialFileRepository } = await import("../src/desktop/main/material/material-file-repository.ts");
  const { ElectronMaterialOcrWorker } = await import("../src/desktop/main/material/material-ocr-worker.ts");
  const { openMaterialFeatureWindow } = await import("../src/desktop/main/material/material-feature-window.ts");
  const { LocalSyncStore } = await import("../src/desktop/main/sync/local-sync-store.ts");
  const { ExperienceMutationExecutor } = await import("../src/desktop/main/experience-library/experience-mutation-executor.ts");
  const { ExperienceProposalService } = await import("../src/desktop/main/experience-library/experience-proposal-service.ts");
  const ownerId = "electron-synthetic-owner";
  const suppliedRoot = process.env.COOLTO_MAT_ACCEPTANCE_ROOT;
  const root = suppliedRoot ?? await mkdtemp(join(tmpdir(), "coolto-material-electron-"));
  let featureWindow;
  let localSync;
  let closeHost = async () => undefined;
  app.setPath("userData", join(root, "user-data"));
  try {
    await app.whenReady();
    const fixture = join(root, "ocr.png");
    trace("electron-ready");
    const canvas = createCanvas(1000, 240);
    const context = canvas.getContext("2d");
    context.fillStyle = "white"; context.fillRect(0, 0, 1000, 240);
    context.fillStyle = "black"; context.font = "bold 56px Arial"; context.fillText("Coolto OCR 42", 60, 130);
    await writeFile(fixture, canvas.toBuffer("image/png"));
    const registry = new SelectedFileRegistry();
    const files = new RegistryMaterialFileBoundary(registry);
    const pickerMode = process.env.MAT_USE_REAL_PICKER === "1" ? "real" : "fixture-host";
    const selectedPaths = pickerMode === "real" ? (await dialog.showOpenDialog({ defaultPath: fixture, properties: ["openFile"] })).filePaths : [fixture];
    const [selected] = await files.registerPaths(selectedPaths);
    const repository = await MaterialFileRepository.openForOwner(ownerId);
    const importer = new MaterialImportService(files, repository);
    const worker = new ElectronMaterialOcrWorker(resolve("out/main/material-ocr-worker.cjs"));
    const resourceProof = await inspectMaterialOcrResources(resolve("node_modules/tesseract.js/src/worker-script/node/index.js"));
    const ocr = new MaterialOcrService(repository, worker);
    const views = new MaterialViewService(repository);
    const deleteImpact = new MaterialDeleteImpactService(repository);
    const exports = new MaterialExportService(repository);
    localSync = await LocalSyncStore.open("https://material-acceptance.invalid", ownerId);
    const experienceExecutor = new ExperienceMutationExecutor(localSync, () => undefined);
    const experienceProposals = new ExperienceProposalService(localSync, experienceExecutor, async () => undefined);
    const seedProposal = await experienceProposals.prepareCreate({ category: "other", title: "Synthetic target", content: "Existing local fact", tags: ["material"], revisionSource: "manual" });
    const seedResult = experienceProposals.execute(seedProposal.id);
    const targetExperienceId = seedResult.experience?.id;
    if (!targetExperienceId) throw new Error("synthetic Experience seed did not persist");
    const commitPort = createExperienceCommitPort(experienceProposals, localSync);
    const proposals = new MaterialProposalService(repository, commitPort);
    const host = createMaterialHostPort({ ownerId, repository, files, importer, ocr, proposals, views, deleteImpact, exports });
    closeHost = () => host.close();
    const tools = createMaterialToolAdapter(host);
    const imported = await host.import({ fileId: selected.id, ownerId });
    trace("host-ready");
    const processed = await host.processOcr(imported.record.asset.identity.materialId);
    trace("import-start");
    const relation = await host.materialTools.prepareRelation({ materialId: processed.materialId, classification: "classified", experienceReferences: [{ experienceId: targetExperienceId, citations: [{ schema: "material.citation", version: 1, ownerId, materialId: processed.materialId, materialHash: processed.contentHash, materialVersion: 1, location: { kind: "page", page: 1, sectionLabel: null } }] }] });
    await host.approveRelation(relation.proposal.proposalId);
    const toolResult = await tools.find((tool) => tool.name === "list_materials")?.execute("acceptance", {});
    const pendingOperations = localSync.listReadyOperations();
    const pending = pendingOperations.length;
    const reopened = await MaterialFileRepository.openForOwner(ownerId);
    const accountB = await MaterialFileRepository.openForOwner("electron-synthetic-owner-b");
    const restored = new MaterialExportService(new MaterialFileRepository(join(root, "restored"), ownerId, randomBytes(32)));
    const restoredCount = await restored.restore(ownerId, await exports.encode(ownerId));
    const current = await repository.get(processed.materialId);
    const outboxExperienceIds = pendingOperations.map((operation) => operation.entityId);
    const lowConfidence = await repository.get(processed.materialId);
    if (!lowConfidence?.asset.processing.ocr) throw new Error("OCR result missing for UI proof");
    await repository.save({
      ...lowConfidence,
      lifecycleStatus: "needs_confirmation",
      parsedText: `${lowConfidence.parsedText ?? ""}\nfeature-content-only-needle`.trim(),
      asset: { ...lowConfidence.asset, processing: { status: "completed", ocr: { ...lowConfidence.asset.processing.ocr, overallConfidence: 0.42, needsUserConfirmation: true } } },
    });
    featureWindow = openMaterialFeatureWindow({ ownerId, repository, files, importer, ocr, proposals, views, deleteImpact, exports, selectPaths: async () => selectedPaths, show: false });
    const uiProof = await runFeatureWindowProof(featureWindow, targetExperienceId);
    if (current?.classification !== "classified" || !current.ocrSegments.length || !outboxExperienceIds.includes(targetExperienceId) || !tools.every((tool) => typeof tool.name === "string")) {
      throw new Error("MAT Electron acceptance assertions failed");
    }
    const marker = { marker: "MAT_PRODUCT_ELECTRON_ACCEPT", pickerMode, mediaKind: processed.mediaKind, classification: current.classification, ocrSegments: current.ocrSegments.length, relationExperienceId: targetExperienceId, outboxExperienceIds, agentToolNames: tools.map((tool) => tool.name), toolReturned: Boolean(toolResult), outboxPending: pending, restartCatalog: (await reopened.list()).length, accountBCatalog: (await accountB.list()).length, restoredCount, ocrResourceProof: { languages: resourceProof.languages, workerPathPresent: resourceProof.workerPath.length > 0 }, uiProof };
    const markerPath = process.env.MAT_MARKER_PATH ?? "C:/Users/Jiansheng/AppData/Local/Temp/coolto-pm/mat-product-electron-marker.json";
    await writeFile(markerPath, JSON.stringify(marker, null, 2), "utf8");
    console.log(JSON.stringify(marker));
    await closeHost(); closeHost = async () => undefined;
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  } finally {
    if (featureWindow && !featureWindow.isDestroyed()) featureWindow.close();
    await closeHost();
    localSync?.close();
    if (!suppliedRoot) await rm(root, { recursive: true, force: true });
    if (app.isReady()) app.quit();
  }
}
async function waitForDom(window, expression, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Material feature DOM condition timed out: ${expression}`);
}

async function runFeatureWindowProof(window, targetExperienceId) {
  await waitForDom(window, "Boolean(document.querySelector('.material-library-view'))");
  const zoom = (window.webContents.setZoomFactor(2), window.webContents.getZoomFactor());
  const rows = await window.webContents.executeJavaScript("document.querySelectorAll('.material-row').length");
  if (!rows) throw new Error(`Material library rendered no material rows: ${await window.webContents.executeJavaScript("document.body.innerText")}`);
  await window.webContents.executeJavaScript("(() => { const input = document.querySelector('.material-search input'); input.value = 'feature-content-only-needle'; input.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await waitForDom(window, "document.querySelectorAll('.material-row').length === 1");
  const contentSearchRows = await window.webContents.executeJavaScript("document.querySelectorAll('.material-row').length");
  await window.webContents.executeJavaScript("(() => { const input = document.querySelector('.material-search input'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await waitForDom(window, "document.querySelectorAll('.material-row').length === 1");
  await window.webContents.executeJavaScript("document.querySelector('.material-row').click()");
  await waitForDom(window, "Boolean(document.querySelector('.material-detail-panel'))");
  const lowConfidenceVisible = Boolean(await window.webContents.executeJavaScript("document.querySelector('.material-ocr-review') !== null"));
  await window.webContents.executeJavaScript("document.querySelector('.material-ocr-review .secondary-button')?.click()");
  await waitForDom(window, "Boolean(document.querySelector('.material-relation-composer'))");
  await window.webContents.executeJavaScript(`(() => { const input = document.querySelector('.material-relation-composer textarea'); input.value = '${targetExperienceId}'; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.material-relation-composer > button').click(); })()`);
  await waitForDom(window, "Boolean(document.querySelector('.material-relation-proposal'))");
  await window.webContents.executeJavaScript("document.querySelector('.material-relation-proposal .primary-button').click()");
  await waitForDom(window, "document.querySelector('.material-relation-proposal')?.textContent.includes('approved')");
  await window.webContents.executeJavaScript("document.querySelector('.material-detail-header .icon-button').click()");
  await waitForDom(window, "Boolean(document.querySelector('.material-impact-preview'))");
  await window.webContents.executeJavaScript("document.querySelector('.material-impact-preview .material-action-row button').click()");
  await waitForDom(window, "document.querySelector('.material-impact-preview') === null");
  const preservedAfterCancel = await window.webContents.executeJavaScript("document.querySelectorAll('.material-row').length === 1");
  await window.webContents.executeJavaScript("document.querySelector('.material-detail-header .icon-button').click()");
  await waitForDom(window, "Boolean(document.querySelector('.material-impact-preview'))");
  await window.webContents.executeJavaScript("document.querySelectorAll('.material-impact-preview .material-action-row button')[1].click()");
  await waitForDom(window, "document.querySelector('.material-row') === null");
  const keyboardFocus = await window.webContents.executeJavaScript("(() => { const button = document.querySelector('.material-library-header button'); button.focus(); return document.activeElement === button; })()");
  return { rows, contentSearchRows, lowConfidenceVisible, preservedAfterCancel, keyboardFocus, zoom };
}


function createExperienceCommitPort(service, localSync) {
  return {
    prepare: async (input) => {
      const citation = JSON.stringify(input.citations[0] ?? null);
      const entity = localSync.getEntity("experience", input.experienceId);
      if (!entity) throw new Error(`target Experience missing: ${input.experienceId}`);
      const currentContent = typeof entity.payload.content === "string" ? entity.payload.content : "";
      const proposal = await service.prepareUpdate(input.experienceId, {
        content: `${currentContent}\n\n【材料引用】${input.proposal.materialId}\n${citation}`,
        revisionSource: "import",
      });
      return { proposalId: proposal.id, experienceId: input.experienceId };
    },
    execute: async (proposalId) => service.execute(proposalId),
    executeMany: async (proposalIds) => service.executeMany(proposalIds),
    discard: (proposalId) => service.discard(proposalId),
  };
}
function trace(message) {
  if (process.env.MAT_DEBUG === "1") console.error(`[MAT] ${message}`);
}
