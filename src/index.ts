import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { parseMultipart, toFieldMap } from "./parse.js";
import type { FieldSpec, FilenestFile, FilenestOptions } from "./types.js";

export { memoryStorage } from "./storage/memoryStorage.js";
export { diskStorage } from "./storage/diskStorage.js";
export { FilenestError } from "./errors.js";
export type { FilenestFile, FilenestOptions, FilenestLimits, StorageEngine, FileFilter } from "./types.js";

interface FilenestRequest extends IncomingMessage {
  headers: IncomingHttpHeaders;
  body?: Record<string, string | string[]>;
  file?: FilenestFile;
  files?: FilenestFile[] | Record<string, FilenestFile[]>;
}

type NextFn = (err?: unknown) => void;
type Middleware = (req: FilenestRequest, res: ServerResponse, next: NextFn) => void;

function isMultipart(req: FilenestRequest): boolean {
  const contentType = req.headers["content-type"];
  return typeof contentType === "string" && contentType.toLowerCase().startsWith("multipart/form-data");
}

function wrap(
  options: FilenestOptions,
  accept: "any" | Map<string, { maxCount: number }>,
  assign: (req: FilenestRequest, files: FilenestFile[]) => void
): Middleware {
  return (req, res, next) => {
    if (!isMultipart(req)) {
      req.body = req.body ?? {};
      next();
      return;
    }

    parseMultipart(req.headers, req, options, accept)
      .then(({ body, files }) => {
        req.body = body;
        assign(req, files);
        next();
      })
      .catch(next);
  };
}

export class Filenest {
  #options: FilenestOptions;

  constructor(options: FilenestOptions = {}) {
    this.#options = options;
  }

  single(fieldName: string): Middleware {
    return wrap(this.#options, toFieldMap([{ name: fieldName, maxCount: 1 }]), (req, files) => {
      req.file = files[0];
    });
  }

  array(fieldName: string, maxCount = Infinity): Middleware {
    return wrap(this.#options, toFieldMap([{ name: fieldName, maxCount }]), (req, files) => {
      req.files = files;
    });
  }

  fields(specs: FieldSpec[]): Middleware {
    return wrap(this.#options, toFieldMap(specs), (req, files) => {
      const grouped: Record<string, FilenestFile[]> = {};
      for (const file of files) {
        (grouped[file.fieldName] ??= []).push(file);
      }
      req.files = grouped;
    });
  }

  none(): Middleware {
    return wrap(this.#options, toFieldMap([]), () => {});
  }

  any(): Middleware {
    return wrap(this.#options, "any", (req, files) => {
      req.files = files;
    });
  }
}

export function filenest(options: FilenestOptions = {}): Filenest {
  return new Filenest(options);
}

export default filenest;
