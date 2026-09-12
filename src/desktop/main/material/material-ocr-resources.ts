import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { defaultOcrResourceDirectory } from "./material-ocr-worker-runtime.js";

const LANGUAGE_FILES = ["eng.traineddata", "chi_sim.traineddata"] as const;

export interface MaterialOcrResourceProof {
  directory: string;
  workerPath: string;
  languages: Record<(typeof LANGUAGE_FILES)[number], { bytes: number; sha256: string }>;
}

export async function inspectMaterialOcrResources(workerPath: string): Promise<MaterialOcrResourceProof> {
  const directory = defaultOcrResourceDirectory();
  const workerMetadata = await stat(workerPath);
  if (!workerMetadata.isFile()) throw new Error("OCR worker resource is not a file");
  const languages = {} as MaterialOcrResourceProof["languages"];
  for (const name of LANGUAGE_FILES) {
    const path = join(directory, name);
    const [metadata, bytes] = await Promise.all([stat(path), readFile(path)]);
    if (!metadata.isFile() || bytes.byteLength === 0) throw new Error(`OCR 语言资源无效: ${name}`);
    languages[name] = { bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  return { directory, workerPath, languages };
}
