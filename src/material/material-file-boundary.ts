import type {
  MaterialSelectedFileContent,
  MaterialSelectedFileMetadata,
} from "../files/types.js";
import type { SelectedFileRegistry } from "../files/selected-file-registry.js";

export interface MaterialFileBoundary {
  registerPaths(paths: readonly string[]): Promise<MaterialSelectedFileMetadata[]>;
  list(): MaterialSelectedFileMetadata[];
  read(fileId: string): Promise<MaterialSelectedFileContent>;
  remove(fileId: string): void;
  clear(): void;
}

export class RegistryMaterialFileBoundary implements MaterialFileBoundary {
  public constructor(private readonly registry: SelectedFileRegistry) {}

  public registerPaths(paths: readonly string[]): Promise<MaterialSelectedFileMetadata[]> {
    return this.registry.registerMaterialPaths([...paths]);
  }

  public list(): MaterialSelectedFileMetadata[] {
    return this.registry.listMaterial();
  }

  public read(fileId: string): Promise<MaterialSelectedFileContent> {
    return this.registry.readMaterial(fileId);
  }

  public remove(fileId: string): void {
    this.registry.remove(fileId);
  }

  public clear(): void {
    this.registry.clear();
  }
}

export function assertOpaqueMaterialFileId(fileId: string): void {
  if (!/^attachment-[A-Za-z0-9-]+$/u.test(fileId)) {
    throw new Error("材料文件引用必须来自当前用户明确选择的文件");
  }
}
