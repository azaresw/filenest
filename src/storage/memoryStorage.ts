import type { StorageEngine } from "../types.js";

export function memoryStorage(): StorageEngine {
  return {
    handleFile() {
      const chunks: Buffer[] = [];
      let size = 0;

      return {
        write(chunk) {
          chunks.push(chunk);
          size += chunk.length;
        },
        async end() {
          return { buffer: Buffer.concat(chunks), size };
        },
        async abort() {
          chunks.length = 0;
        },
      };
    },
  };
}
