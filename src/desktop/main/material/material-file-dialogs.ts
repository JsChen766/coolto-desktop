import { app, dialog, type BrowserWindow } from "electron";
import { join } from "node:path";

const MATERIAL_IMPORT_FILTERS = [{
  name: "文档材料",
  extensions: ["pdf", "docx", "txt", "md", "markdown", "png", "jpg", "jpeg", "webp"],
}];

export function createMaterialFileDialogSelectors(window: BrowserWindow) {
  return {
    selectPaths: async (): Promise<string[]> => {
      const selection = await dialog.showOpenDialog(window, {
        title: "选择材料文件",
        properties: ["openFile", "multiSelections"],
        filters: MATERIAL_IMPORT_FILTERS,
      });
      return selection.canceled ? [] : selection.filePaths;
    },
    selectExportPath: async (): Promise<string | undefined> => {
      const result = await dialog.showSaveDialog(window, {
        title: "导出材料备份",
        defaultPath: join(app.getPath("documents"), "coolto-materials-backup.json"),
        buttonLabel: "导出",
        filters: [{ name: "材料备份", extensions: ["json"] }],
        properties: ["createDirectory", "showOverwriteConfirmation"],
      });
      return result.canceled ? undefined : result.filePath;
    },
    selectRestorePath: async (): Promise<string | undefined> => {
      const result = await dialog.showOpenDialog(window, {
        title: "恢复材料备份",
        properties: ["openFile"],
        filters: [{ name: "材料备份", extensions: ["json"] }],
      });
      return result.canceled ? undefined : result.filePaths[0];
    },
  };
}
