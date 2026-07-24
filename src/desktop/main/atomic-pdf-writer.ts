import { randomUUID } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export interface AtomicPdfFileOperations {
  write(path: string, data: Uint8Array): Promise<void>;
  rename(source: string, target: string): Promise<void>;
  remove(path: string): Promise<void>;
}

const NODE_FILE_OPERATIONS: AtomicPdfFileOperations = {
  write: (path, data) => writeFile(path, data, { flag: "wx" }),
  rename,
  remove: unlink,
};

export async function atomicWritePdf(
  filePath: string,
  pdf: Uint8Array,
  operations: AtomicPdfFileOperations = NODE_FILE_OPERATIONS,
): Promise<void> {
  const temporaryPath = join(
    dirname(filePath),
    `.${basename(filePath)}.${randomUUID()}.tmp`,
  );
  let temporaryCreated = false;
  try {
    await operations.write(temporaryPath, pdf);
    temporaryCreated = true;
    await operations.rename(temporaryPath, filePath);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) {
      await operations.remove(temporaryPath).catch(() => undefined);
    }
  }
}
