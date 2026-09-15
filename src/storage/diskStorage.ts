import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { StorageEngine } from "../types.js";

export interface DiskStorageOptions {
  destination?:
    | string
    | ((fieldName: string, meta: { originalName: string; mimeType: string }) => string | Promise<string>);
  filename?: (fieldName: string, meta: { originalName: string; mimeType: string }) => string | Promise<string>;
}

async function defaultFilename(): Promise<string> {
  return randomBytes(16).toString("hex");
}

export function diskStorage(options: DiskStorageOptions = {}): StorageEngine {
  const getDestination = options.destination ?? (() => process.cwd());
  const getFilename = options.filename ?? defaultFilename;

  return {
    async handleFile(fieldName, meta) {
      const destination =
        typeof getDestination === "function" ? await getDestination(fieldName, meta) : getDestination;

      // Guard against a filename callback trying to escape the destination directory.
      const rawFilename = await getFilename(fieldName, meta);
      const filename = path.basename(rawFilename);

      await fs.mkdir(destination, { recursive: true });
      const fullPath = path.join(destination, filename);

      const stream = createWriteStream(fullPath);
      let size = 0;

      return {
        write(chunk) {
          size += chunk.length;
          stream.write(chunk);
        },
        end() {
          return new Promise((resolve, reject) => {
            stream.end(() => resolve({ path: fullPath, destination, filename, size }));
            stream.on("error", reject);
          });
        },
        async abort() {
          stream.destroy();
          await fs.unlink(fullPath).catch(() => {});
        },
      };
    },
  };
}
