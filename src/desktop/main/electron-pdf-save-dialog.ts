import { app, dialog, type BrowserWindow } from "electron";
import { join } from "node:path";

import type { ResumePdfSaveDialog } from "./resume-pdf-export-service.js";

export class ElectronResumePdfSaveDialog implements ResumePdfSaveDialog {
  public constructor(private readonly parent: BrowserWindow) {}

  public async choosePath(
    suggestedFilename: string,
  ): Promise<string | undefined> {
    const result = await dialog.showSaveDialog(this.parent, {
      title: "导出简历 PDF",
      defaultPath: join(app.getPath("documents"), suggestedFilename),
      buttonLabel: "导出",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"],
    });
    return result.canceled ? undefined : result.filePath;
  }
}
