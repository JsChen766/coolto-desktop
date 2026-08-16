import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

import {
  downloadUpdateFile,
  type DownloadUpdateInput,
} from "./update-downloader.js";
import { findAppBundleInStaging } from "./update-installer.js";

// vm（protect-main-bundle）中 dynamic import() 不可用，按需加载走 require。
const nodeRequire = createRequire(import.meta.url);

export interface PrepareStagingInput {
  version: string;
  stagingRoot: string;
  feedUrl: string;
  files: DownloadUpdateInput["files"];
  onProgress?: DownloadUpdateInput["onProgress"];
  download?: (input: DownloadUpdateInput) => Promise<{
    bytes: number;
    sha512: string;
  }>;
  extractZip?: (zipPath: string, destDir: string) => Promise<void>;
}

/**
 * Downloads the update zip, verifies its SHA-512, extracts it and returns the
 * staging directory holding the extracted .app bundle. Cleans up the staging
 * directory on any failure (fail-closed).
 */
export async function prepareStaging(
  input: PrepareStagingInput,
): Promise<string> {
  const staging = join(input.stagingRoot, input.version);
  const zipPath = join(staging, "update.zip");
  try {
    await (input.download ?? downloadUpdateFile)({
      files: input.files,
      feedUrl: input.feedUrl,
      targetPath: zipPath,
      ...(input.onProgress ? { onProgress: input.onProgress } : {}),
    });
    await mkdir(staging, { recursive: true });
    await (input.extractZip ?? extractWithDitto)(zipPath, staging);
    const bundle = await findAppBundleInStaging(staging);
    if (!bundle) {
      throw new Error("更新包中没有可安装的应用。");
    }
    return staging;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function extractWithDitto(zipPath: string, destDir: string): Promise<void> {
  const { execFile } = nodeRequire("node:child_process") as typeof import("node:child_process");
  const { promisify } = nodeRequire("node:util") as typeof import("node:util");
  await promisify(execFile)("ditto", ["-x", "-k", zipPath, destDir]);
}
