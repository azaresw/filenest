import Busboy from "busboy";
import type { IncomingHttpHeaders } from "node:http";

type BusboyInstance = ReturnType<typeof Busboy>;
import { FilenestError } from "./errors.js";
import type { FieldSpec, FilenestFile, FilenestOptions } from "./types.js";

export type FieldAcceptance = "any" | Map<string, { maxCount: number }>;

export interface ParseResult {
  body: Record<string, string | string[]>;
  files: FilenestFile[];
}

export function parseMultipart(
  headers: IncomingHttpHeaders,
  body: NodeJS.ReadableStream,
  options: FilenestOptions,
  accept: FieldAcceptance
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    let busboy: BusboyInstance;
    try {
      busboy = Busboy({ headers: headers as Record<string, string>, limits: options.limits });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const storage = options.storage;
    const fields: Record<string, string | string[]> = {};
    const files: FilenestFile[] = [];
    const fileCountByField = new Map<string, number>();
    const pendingFiles: Promise<void>[] = [];

    let settled = false;
    const activeHandles: { abort(): Promise<void> }[] = [];

    function fail(err: Error) {
      if (settled) return;
      settled = true;
      busboy!.removeAllListeners();
      body.unpipe(busboy as unknown as NodeJS.WritableStream);
      Promise.allSettled(activeHandles.map((h) => h.abort())).finally(() => reject(err));
    }

    busboy.on("field", (name, value, info) => {
      if (info.nameTruncated) return fail(new FilenestError("LIMIT_FIELD_KEY", name));
      if (info.valueTruncated) return fail(new FilenestError("LIMIT_FIELD_VALUE", name));

      const existing = fields[name];
      if (existing === undefined) {
        fields[name] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        fields[name] = [existing, value];
      }
    });

    busboy.on("file", (fieldName, stream, info) => {
      const { filename: originalName, encoding, mimeType } = info;

      const allowed =
        accept === "any" ||
        (accept.has(fieldName) && (fileCountByField.get(fieldName) ?? 0) < (accept.get(fieldName)!.maxCount ?? Infinity));

      if (!allowed) {
        stream.resume();
        return fail(new FilenestError("LIMIT_UNEXPECTED_FILE", fieldName));
      }

      fileCountByField.set(fieldName, (fileCountByField.get(fieldName) ?? 0) + 1);

      const task = (async () => {
        const meta = { originalName, encoding, mimeType };

        if (options.fileFilter) {
          const keep = await options.fileFilter(fieldName, { fieldName, ...meta });
          if (!keep) {
            stream.resume();
            return;
          }
        }

        if (!storage) {
          stream.resume();
          throw new FilenestError("FILE_REJECTED", fieldName, "No storage engine configured.");
        }

        const handle = await storage.handleFile(fieldName, meta);
        activeHandles.push(handle);

        for await (const chunk of stream) {
          handle.write(chunk as Buffer);
        }

        if (stream.truncated) {
          await handle.abort();
          throw new FilenestError("LIMIT_FILE_SIZE", fieldName);
        }

        const result = await handle.end();
        files.push({ fieldName, originalName, encoding, mimeType, ...result });
      })();

      pendingFiles.push(task);
    });

    busboy.on("filesLimit", () => fail(new FilenestError("LIMIT_FILE_COUNT")));
    busboy.on("fieldsLimit", () => fail(new FilenestError("LIMIT_FIELD_COUNT")));
    busboy.on("partsLimit", () => fail(new FilenestError("LIMIT_PART_COUNT")));
    busboy.on("error", (err) => fail(err instanceof Error ? err : new Error(String(err))));

    busboy.on("close", () => {
      if (settled) return;
      Promise.all(pendingFiles)
        .then(() => {
          if (settled) return;
          settled = true;
          resolve({ body: fields, files });
        })
        .catch(fail);
    });

    body.pipe(busboy);
  });
}

export function toFieldMap(specs: FieldSpec[]): Map<string, { maxCount: number }> {
  const map = new Map<string, { maxCount: number }>();
  for (const spec of specs) {
    map.set(spec.name, { maxCount: spec.maxCount ?? 1 });
  }
  return map;
}
