import type { MaterialDeleteImpact } from "../../../material/material-delete-impact.js";
import { MaterialDeleteImpactService as CoreMaterialDeleteImpactService } from "../../../material/material-delete-impact.js";
import type { MaterialRepository } from "../../../material/material-repository.js";

export class DesktopMaterialDeleteImpactService {
  readonly #service: CoreMaterialDeleteImpactService;

  public constructor(repository: MaterialRepository) {
    this.#service = new CoreMaterialDeleteImpactService(repository);
  }

  public preview(materialId: string): Promise<MaterialDeleteImpact> {
    return this.#service.preview(materialId);
  }

  public cancel(token: string): void {
    this.#service.cancel(token);
  }

  public confirm(token: string): Promise<void> {
    return this.#service.confirm(token);
  }
}
