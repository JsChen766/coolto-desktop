import { SelectedFileRegistry } from "../../../files/selected-file-registry.js";
import { RegistryMaterialFileBoundary } from "../../../material/material-file-boundary.js";
import { MaterialDeleteImpactService } from "../../../material/material-delete-impact.js";
import { MaterialExportService } from "../../../material/material-export.js";
import { MaterialImportService } from "../../../material/material-import-service.js";
import { MaterialOcrService } from "../../../material/material-ocr-service.js";
import { MaterialProposalService } from "../../../material/material-proposal-service.js";
import { MaterialViewService } from "../../../material/material-view.js";
import { createMaterialHostPort, type MaterialHostPort } from "../../../material/material-host-contract.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import type { ExperienceProposalService } from "../experience-library/experience-proposal-service.js";
import { MaterialFileRepository } from "./material-file-repository.js";
import { ElectronMaterialOcrWorker } from "./material-ocr-worker.js";
import { resolveMaterialOcrWorkerEntryPath } from "./material-ocr-worker-path.js";
import { DesktopMaterialViewService } from "./material-view-service.js";
import { DesktopMaterialDeleteImpactService } from "./material-delete-impact-service.js";
import { DesktopMaterialExportService } from "./material-export-service.js";
import { createExperienceMaterialRelationCommitPort } from "./experience-material-relation-commit-port.js";
import type { MaterialIpcCoreDependencies } from "./material-ipc.js";

export interface MaterialUserHostBundle {
  host: MaterialHostPort;
  ipc: MaterialIpcCoreDependencies;
}

export async function openMaterialUserHost(input: {
  ownerId: string;
  apiBaseUrl: string;
  syncStore: LocalSyncStore;
  experienceProposals: ExperienceProposalService;
}): Promise<MaterialUserHostBundle> {
  const repository = await MaterialFileRepository.openForOwner(input.ownerId, input.apiBaseUrl);
  const registry = new SelectedFileRegistry();
  const files = new RegistryMaterialFileBoundary(registry);
  const importer = new MaterialImportService(files, repository);
  const worker = new ElectronMaterialOcrWorker(resolveMaterialOcrWorkerEntryPath());
  const ocr = new MaterialOcrService(repository, worker);
  const views = new MaterialViewService(repository);
  const deleteImpact = new MaterialDeleteImpactService(repository);
  const exports = new MaterialExportService(repository);
  const commitPort = createExperienceMaterialRelationCommitPort(
    input.experienceProposals,
    input.syncStore,
  );
  const proposals = new MaterialProposalService(repository, commitPort);
  const host = createMaterialHostPort({
    ownerId: input.ownerId,
    repository,
    files,
    importer,
    ocr,
    proposals,
    views,
    deleteImpact,
    exports,
  });
  return {
    host,
    ipc: {
      ownerId: input.ownerId,
      repository,
      files,
      importer,
      ocr,
      proposals,
      views: new DesktopMaterialViewService(repository),
      deleteImpact: new DesktopMaterialDeleteImpactService(repository),
      exports: new DesktopMaterialExportService(repository, input.ownerId),
    },
  };
}
