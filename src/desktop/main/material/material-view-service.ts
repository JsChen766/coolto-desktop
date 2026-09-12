import type { MaterialSearchOptions, MaterialView } from "../../../material/material-view.js";
import { MaterialViewService as CoreMaterialViewService } from "../../../material/material-view.js";
import type { MaterialRepository } from "../../../material/material-repository.js";

export class DesktopMaterialViewService {
  readonly #views: CoreMaterialViewService;

  public constructor(repository: MaterialRepository) {
    this.#views = new CoreMaterialViewService(repository);
  }

  public list(options?: MaterialSearchOptions): Promise<MaterialView[]> {
    return this.#views.list(options);
  }

  public search(options?: MaterialSearchOptions): Promise<MaterialView[]> {
    return this.#views.search(options);
  }

  public get(materialId: string): Promise<MaterialView | undefined> {
    return this.#views.get(materialId);
  }
}
