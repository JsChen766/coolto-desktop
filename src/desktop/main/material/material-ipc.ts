import type { IpcMain } from "electron";

import type {
  MaterialImportViewInput,
  MaterialExportReceipt,
  MaterialRelationCitationInput,
  MaterialRelationProposalView,
} from "../../shared/types/material.js";
import type { MaterialAssetV1 } from "../../../material/material-types.js";
import type { MaterialFileBoundary } from "../../../material/material-file-boundary.js";
import type { MaterialImportService } from "../../../material/material-import-service.js";
import type { MaterialOcrService } from "../../../material/material-ocr-service.js";
import type { MaterialProposalService } from "../../../material/material-proposal-service.js";
import type { MaterialRepository } from "../../../material/material-repository.js";
import type { MaterialSearchOptions, MaterialView } from "../../../material/material-view.js";
import type { DesktopMaterialDeleteImpactService } from "./material-delete-impact-service.js";
import type { DesktopMaterialExportService } from "./material-export-service.js";
import type { DesktopMaterialViewService } from "./material-view-service.js";

export interface MaterialIpcCoreDependencies {
  ownerId: string;
  repository: MaterialRepository;
  files: MaterialFileBoundary;
  importer: MaterialImportService;
  ocr: MaterialOcrService;
  proposals: MaterialProposalService;
  views: DesktopMaterialViewService;
  deleteImpact: DesktopMaterialDeleteImpactService;
  exports: DesktopMaterialExportService;
}

export interface MaterialIpcDependencies extends MaterialIpcCoreDependencies {
  selectPaths(): Promise<string[]>;
  selectExportPath?(): Promise<string | undefined>;
  selectRestorePath?(): Promise<string | undefined>;
}

export type MaterialIpcDependencySource =
  | MaterialIpcDependencies
  | (() => Promise<MaterialIpcDependencies>);

function resolveMaterialIpcDependencies(
  source: MaterialIpcDependencySource,
): Promise<MaterialIpcDependencies> {
  return typeof source === "function" ? source() : Promise.resolve(source);
}

export const MATERIAL_IPC_CHANNELS = [
  "material:select", "material:list", "material:get", "material:import", "material:ocr",
  "material:ocr-confirm", "material:relation:prepare", "material:relation:approve",
  "material:relation:reject", "material:delete:preview", "material:delete:cancel",
  "material:delete:confirm", "material:export", "material:restore",
] as const;

export function registerMaterialIpc(ipcMain: IpcMain, source: MaterialIpcDependencySource): () => void {
  ipcMain.handle("material:select", async () => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    return dependencies.files.registerPaths(await dependencies.selectPaths());
  });
  ipcMain.handle("material:list", async (_event, options?: unknown) => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    return listViews(dependencies.views, parseSearchOptions(options));
  });
  ipcMain.handle("material:get", async (_event, materialId: string) => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    return dependencies.views.get(materialId);
  });
  ipcMain.handle("material:import", async (_event, input: MaterialImportViewInput) => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    return importMaterial(dependencies, input);
  });
  ipcMain.handle("material:ocr", async (_event, materialId: string) => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    return processOcr(dependencies, materialId);
  });
  ipcMain.handle("material:ocr-confirm", async (_event, materialId: string, correctedText?: string) => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    return confirmOcr(dependencies, materialId, correctedText);
  });
  ipcMain.handle("material:relation:prepare", async (_event, input: RelationPrepareInput) => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    return prepareRelation(dependencies, input);
  });
  ipcMain.handle("material:relation:approve", async (_event, proposalId: string) => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    return toProposalView(await dependencies.proposals.approve(proposalId));
  });
  ipcMain.handle("material:relation:reject", async (_event, proposalId: string) => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    dependencies.proposals.reject(proposalId);
  });
  ipcMain.handle("material:delete:preview", async (_event, materialId: string) => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    return dependencies.deleteImpact.preview(materialId);
  });
  ipcMain.handle("material:delete:cancel", async (_event, token: string) => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    dependencies.deleteImpact.cancel(token);
  });
  ipcMain.handle("material:delete:confirm", async (_event, token: string) => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    return dependencies.deleteImpact.confirm(token);
  });
  ipcMain.handle("material:export", async () => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    return exportPackage(dependencies);
  });
  ipcMain.handle("material:restore", async () => {
    const dependencies = await resolveMaterialIpcDependencies(source);
    return restorePackage(dependencies);
  });
  return () => {
    for (const channel of MATERIAL_IPC_CHANNELS) ipcMain.removeHandler(channel);
  };
}

async function exportPackage(dependencies: MaterialIpcDependencies): Promise<MaterialExportReceipt | null> {
  const filePath = await dependencies.selectExportPath?.();
  return filePath ? dependencies.exports.exportToFile(filePath) : null;
}

async function restorePackage(dependencies: MaterialIpcDependencies): Promise<number | null> {
  const filePath = await dependencies.selectRestorePath?.();
  return filePath ? dependencies.exports.restoreFromFile(filePath) : null;
}

interface RelationPrepareInput {
  materialId: string;
  classification: "unclassified" | "classified";
  experienceReferences: Array<{ experienceId: string; citations: MaterialRelationCitationInput[] }>;
}

export async function listViews(views: Pick<DesktopMaterialViewService, "list" | "search">, options?: MaterialSearchOptions): Promise<MaterialView[]> {
  return options?.query ? views.search(options) : views.list(options);
}

async function importMaterial(dependencies: MaterialIpcDependencies, input: MaterialImportViewInput): Promise<MaterialView> {
  const result = await dependencies.importer.import({ ...input, ownerId: dependencies.ownerId });
  const view = await dependencies.views.get(result.record.asset.identity.materialId);
  if (!view) throw new Error("材料导入后无法读取本地视图");
  if (result.record.lifecycleStatus === "queued") {
    void dependencies.ocr.process(result.record.asset.identity.materialId).catch(() => undefined);
  }
  return view;
}

async function processOcr(dependencies: MaterialIpcDependencies, materialId: string): Promise<MaterialView> {
  await dependencies.ocr.process(materialId);
  return requiredView(dependencies, materialId, "OCR 完成后无法读取材料视图");
}

async function confirmOcr(dependencies: MaterialIpcDependencies, materialId: string, correctedText?: string): Promise<MaterialView> {
  await dependencies.ocr.confirm(materialId, correctedText);
  return requiredView(dependencies, materialId, "OCR 确认后无法读取材料视图");
}

async function prepareRelation(dependencies: MaterialIpcDependencies, input: RelationPrepareInput): Promise<MaterialRelationProposalView> {
  const record = await dependencies.repository.get(input.materialId);
  if (!record) throw new Error(`Material ${input.materialId} 不存在`);
  const experienceReferences = input.experienceReferences.map((reference) => ({
    experienceId: reference.experienceId,
    citations: reference.citations.map((citation) => citationFor(record.asset, citation)),
  }));
  const proposal = await dependencies.proposals.prepare(input.materialId, {
    classification: input.classification,
    experienceReferences,
  });
  return toProposalView(proposal);
}

function citationFor(asset: MaterialAssetV1, input: MaterialRelationCitationInput): Record<string, unknown> {
  return {
    schema: "material.citation", version: 1,
    ownerId: asset.identity.ownerId, materialId: asset.identity.materialId,
    materialHash: asset.identity.contentHash, materialVersion: asset.identity.contentVersion,
    location: locationFor(input),
  };
}

function locationFor(input: MaterialRelationCitationInput): Record<string, unknown> {
  const location: Record<string, unknown> = { kind: input.kind };
  if (["page", "page_paragraph", "page_paragraph_offset"].includes(input.kind)) location.page = input.page;
  if (["paragraph", "page_paragraph", "page_paragraph_offset"].includes(input.kind)) location.paragraph = input.paragraph;
  if (["offset", "page_paragraph_offset"].includes(input.kind)) {
    location.startOffset = input.startOffset;
    location.endOffset = input.endOffset;
  }
  location.sectionLabel = input.kind === "section" ? input.sectionLabel ?? "" : input.sectionLabel ?? null;
  return location;
}

function toProposalView(value: { proposal: { proposalId: string; materialId: string; classification: "classified" | "unclassified"; experienceReferences: Array<{ experienceId: string }> }; status: string }): MaterialRelationProposalView {
  return {
    proposalId: value.proposal.proposalId,
    materialId: value.proposal.materialId,
    classification: value.proposal.classification,
    status: value.status as MaterialRelationProposalView["status"],
    experienceIds: value.proposal.experienceReferences.map((reference) => reference.experienceId),
  };
}

function requiredView(dependencies: MaterialIpcDependencies, materialId: string, message: string): Promise<MaterialView> {
  return dependencies.views.get(materialId).then((view) => {
    if (!view) throw new Error(message);
    return view;
  });
}

function parseSearchOptions(value: unknown): MaterialSearchOptions | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const options: MaterialSearchOptions = {};
  if (typeof input.query === "string") options.query = input.query.slice(0, 200);
  if (typeof input.status === "string") {
    options.status = input.status as NonNullable<MaterialSearchOptions["status"]>;
  }
  if (input.classification === "unclassified" || input.classification === "classified") options.classification = input.classification;
  if (typeof input.limit === "number" && Number.isSafeInteger(input.limit)) options.limit = input.limit;
  return options;
}
