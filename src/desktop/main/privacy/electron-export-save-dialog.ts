import { join } from "node:path";

import { app, dialog, type BrowserWindow } from "electron";

import type { ExportSaveDialog } from "./data-export-service.js";

export class ElectronExportSaveDialog implements ExportSaveDialog {
  public constructor(private readonly window: BrowserWindow) {}

  public async choosePath(suggestedFilename: string): Promise<string | undefined> {
    const result = await dialog.showSaveDialog(this.window, {
      title: "导出 Coolto 数据",
      defaultPath: join(app.getPath("documents"), suggestedFilename),
      buttonLabel: "导出",
      filters: [{ name: "Coolto export", extensions: ["coolto-export.json"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"],
    });
    return result.canceled ? undefined : result.filePath;
  }
}
