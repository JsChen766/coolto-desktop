import type { MaterialFileBoundary } from "./material-file-boundary.js";
import type { MaterialImportInput, MaterialImportResult, MaterialImportService } from "./material-import-service.js";
import type { MaterialOcrService } from "./material-ocr-service.js";
import type { MaterialProposalService, MaterialRelationProposalRecord } from "./material-proposal-service.js";
import type { MaterialDeleteImpact, MaterialDeleteImpactService } from "./material-delete-impact.js";
import type { MaterialExportPackageV1, MaterialExportService } from "./material-export.js";
import { MaterialHostOperationGate } from "./material-host-operation-gate.js";
import type { MaterialRepository } from "./material-repository.js";
import type { MaterialSearchOptions, MaterialView, MaterialViewService } from "./material-view.js";

export interface MaterialCatalogPort {
  list(options?: MaterialSearchOptions): Promise<MaterialView[]>;
  get(materialId: string): Promise<MaterialView | undefined>;
}

export interface MaterialToolsPort {
  list(options?: MaterialSearchOptions): Promise<MaterialView[]>;
  get(materialId: string): Promise<MaterialView | undefined>;
  prepareRelation(input: MaterialPrepareRelationInput): Promise<MaterialRelationProposalRecord>;
  prepareDelete(materialId: string): Promise<MaterialDeleteImpact>;
  confirmOcr(materialId: string, correctedText?: string): Promise<MaterialView>;
}

export interface MaterialPrepareRelationInput {
  materialId: string;
  classification: "unclassified" | "classified";
  experienceReferences: Array<{ experienceId: string; citations: readonly unknown[] }>;
}

export interface MaterialHostPort {
  readonly ownerId: string;
  readonly materialCatalog: MaterialCatalogPort;
  readonly materialFileBoundary: MaterialFileBoundary;
  readonly materialTools: MaterialToolsPort;
  import(input: MaterialImportInput): Promise<MaterialImportResult>;
  processOcr(materialId: string): Promise<MaterialView>;
  approveRelation(proposalId: string): Promise<MaterialRelationProposalRecord>;
  rejectRelation(proposalId: string): Promise<void>;
  cancelDelete(confirmationToken: string): Promise<void>;
  confirmDelete(confirmationToken: string): Promise<void>;
  exportPackage(): Promise<MaterialExportPackageV1>;
  restorePackage(input: MaterialExportPackageV1 | Uint8Array): Promise<number>;
  clearLocalData(): Promise<void>;
  close(): Promise<void>;
}

export interface MaterialHostDependencies {
  ownerId: string;
  repository: MaterialRepository;
  files: MaterialFileBoundary;
  importer: MaterialImportService;
  ocr: MaterialOcrService;
  proposals: MaterialProposalService;
  views: MaterialViewService;
  deleteImpact: MaterialDeleteImpactService;
  exports: MaterialExportService;
  /** Reuse one instance for every facade that serves this owner. */
  operationGate?: MaterialHostOperationGate;
}

export function createMaterialHostPort(dependencies: MaterialHostDependencies): MaterialHostPort {
  const gate = dependencies.operationGate ?? new MaterialHostOperationGate();
  let clearPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;
  let ocrClosePromise: Promise<void> | undefined;
  const closeOcr = (): Promise<void> => ocrClosePromise ??= gate.quiesce().then(() => dependencies.ocr.close());
  const files: MaterialFileBoundary = {
    registerPaths: (paths) => gate.run(() => dependencies.files.registerPaths(paths)),
    list: () => { gate.assertOpen(); return dependencies.files.list(); },
    read: (fileId) => gate.run(() => dependencies.files.read(fileId)),
    remove: (fileId) => { gate.assertOpen(); dependencies.files.remove(fileId); },
    clear: () => { gate.assertOpen(); dependencies.files.clear(); },
  };
  const catalog: MaterialCatalogPort = {
    list: (options) => gate.run(() => options?.query ? dependencies.views.search(options) : dependencies.views.list(options)),
    get: (materialId) => gate.run(() => dependencies.views.get(materialId)),
  };
  const tools: MaterialToolsPort = {
    list: catalog.list,
    get: catalog.get,
    prepareRelation: (input) => gate.run(() => dependencies.proposals.prepare(input.materialId, {
      classification: input.classification,
      experienceReferences: input.experienceReferences.map((reference) => ({
        experienceId: reference.experienceId,
        citations: [...reference.citations],
      })),
    })),
    prepareDelete: (materialId) => gate.run(() => dependencies.deleteImpact.preview(materialId)),
    confirmOcr: (materialId, correctedText) => gate.run(async () => {
      await dependencies.ocr.confirm(materialId, correctedText);
      const view = await dependencies.views.get(materialId);
      if (!view) throw new Error("OCR 确认后无法读取材料视图");
      return view;
    }),
  };
  const clearLocalData = (): Promise<void> => clearPromise ??= gate.quiesce().then(async () => {
    dependencies.proposals.clear();
    await closeOcr();
    dependencies.files.clear();
    await dependencies.repository.clear();
  });
  const close = (): Promise<void> => clearPromise ?? (closePromise ??= closeOcr());
  return {
    ownerId: dependencies.ownerId,
    materialCatalog: catalog,
    materialFileBoundary: files,
    materialTools: tools,
    import: (input) => gate.run(() => {
      if (input.ownerId !== dependencies.ownerId) throw new Error("材料宿主账号范围不一致");
      return dependencies.importer.import(input);
    }),
    processOcr: (materialId) => gate.run(async () => {
      await dependencies.ocr.process(materialId);
      const view = await dependencies.views.get(materialId);
      if (!view) throw new Error("OCR 完成后无法读取材料视图");
      return view;
    }),
    approveRelation: (proposalId) => gate.run(() => dependencies.proposals.approve(proposalId)),
    rejectRelation: (proposalId) => gate.run(() => dependencies.proposals.rejectAndWait(proposalId)),
    cancelDelete: (token) => gate.run(() => dependencies.deleteImpact.cancel(token)),
    confirmDelete: (token) => gate.run(() => dependencies.deleteImpact.confirm(token)),
    exportPackage: () => gate.run(() => dependencies.exports.export(dependencies.ownerId)),
    restorePackage: (input) => gate.run(() => dependencies.exports.restore(dependencies.ownerId, input)),
    clearLocalData,
    close,
  };
}
