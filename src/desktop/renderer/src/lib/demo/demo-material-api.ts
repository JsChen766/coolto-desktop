import type { MaterialApi } from "@desktop/types/material";

const unsupported = async (): Promise<never> => {
  throw new Error("Demo 不支持材料库");
};

export function createDemoMaterialApi(): MaterialApi {
  return {
    select: unsupported,
    list: async () => [],
    get: async () => undefined,
    import: unsupported,
    processOcr: unsupported,
    confirmOcr: unsupported,
    prepareRelation: unsupported,
    approveRelation: unsupported,
    rejectRelation: unsupported,
    previewDelete: unsupported,
    cancelDelete: unsupported,
    confirmDelete: unsupported,
    exportPackage: async () => null,
    restorePackage: async () => null,
  };
}
