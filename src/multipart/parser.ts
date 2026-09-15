import { PassThrough, Writable } from "node:stream";
import { parseContentDisposition } from "./contentDisposition.js";

export interface MultipartLimits {
  fieldNameSize?: number;
  fieldSize?: number;
  fields?: number;
  fileSize?: number;
  files?: number;
  parts?: number;
}

export interface FileEventInfo {
  filename: string;
  encoding: string;
  mimeType: string;
}

export interface FieldEventInfo {
  nameTruncated: boolean;
  valueTruncated: boolean;
}

export class FileSink extends PassThrough {
  truncated = false;
}

type State = "PREAMBLE" | "BOUNDARY_TAIL" | "HEADERS" | "BODY" | "DONE";

const MAX_HEADER_BYTES = 32 * 1024;
const HEADER_TERMINATOR = "\r\n\r\n";

/**
 * A streaming multipart/form-data parser built entirely on Node's `stream` and
 * `buffer` built-ins — no third-party dependency in the supply chain.
 *
 * Pipe an HTTP request body into it (`req.pipe(parser)`) and listen for
 * `"field"`, `"file"`, `"error"`, and the `*Limit` events, then `"close"` once
 * every part has been fully read.
 */
export class MultipartParser extends Writable {
  private readonly initialBoundary: Buffer;
  private readonly delimiter: Buffer;
  private readonly limits: Required<MultipartLimits>;

  private buffer = Buffer.alloc(0);
  private state: State = "PREAMBLE";

  private partsCount = 0;
  private fieldsCount = 0;
  private filesCount = 0;

  private isFile = false;
  private skipPart = false;
  private fieldName = "";
  private fieldNameTruncated = false;

  private fieldChunks: Buffer[] = [];
  private fieldSize = 0;
  private fieldTruncated = false;

  private fileInfo: FileEventInfo | null = null;
  private sink: FileSink | null = null;
  private fileSize = 0;

  constructor(boundary: string, limits: MultipartLimits = {}) {
    super();
    this.initialBoundary = Buffer.from(`--${boundary}`);
    this.delimiter = Buffer.from(`\r\n--${boundary}`);
    this.limits = {
      fieldNameSize: limits.fieldNameSize ?? 100,
      fieldSize: limits.fieldSize ?? 1024 * 1024,
      fields: limits.fields ?? Infinity,
      fileSize: limits.fileSize ?? Infinity,
      files: limits.files ?? Infinity,
      parts: limits.parts ?? Infinity,
    };
  }

  override _write(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void): void {
    try {
      this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
      this.advance();
      callback();
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }

  override _final(callback: (error?: Error | null) => void): void {
    try {
      if (this.state !== "DONE" && this.sink) {
        // Stream ended mid-part: whatever we were reading is incomplete/malformed.
        throw new Error("Unexpected end of multipart stream");
      }
      this.emit("close");
      callback();
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private advance(): void {
    for (;;) {
      switch (this.state) {
        case "PREAMBLE": {
          const idx = this.buffer.indexOf(this.initialBoundary);
          if (idx === -1) {
            this.keepTail(this.initialBoundary.length);
            return;
          }
          this.buffer = this.buffer.subarray(idx + this.initialBoundary.length);
          this.state = "BOUNDARY_TAIL";
          continue;
        }

        case "BOUNDARY_TAIL": {
          if (this.buffer.length < 2) return;
          if (this.buffer[0] === 0x2d && this.buffer[1] === 0x2d) {
            this.state = "DONE";
            return;
          }
          this.buffer = this.buffer.subarray(2); // skip the CRLF after the boundary
          this.state = "HEADERS";
          continue;
        }

        case "HEADERS": {
          const idx = this.buffer.indexOf(HEADER_TERMINATOR);
          if (idx === -1) {
            if (this.buffer.length > MAX_HEADER_BYTES) {
              throw new Error("Multipart part header section too large");
            }
            return;
          }
          const headerText = this.buffer.subarray(0, idx).toString("utf8");
          this.buffer = this.buffer.subarray(idx + HEADER_TERMINATOR.length);
          this.startPart(headerText);
          this.state = "BODY";
          continue;
        }

        case "BODY": {
          const idx = this.buffer.indexOf(this.delimiter);
          if (idx === -1) {
            const safeLength = Math.max(0, this.buffer.length - (this.delimiter.length - 1));
            if (safeLength > 0) {
              this.pushBody(this.buffer.subarray(0, safeLength));
              this.buffer = this.buffer.subarray(safeLength);
            }
            return;
          }
          this.pushBody(this.buffer.subarray(0, idx));
          this.buffer = this.buffer.subarray(idx + this.delimiter.length);
          this.finishPart();
          this.state = "BOUNDARY_TAIL";
          continue;
        }

        case "DONE":
          return;
      }
    }
  }

  private keepTail(matchLength: number): void {
    const keepFrom = Math.max(0, this.buffer.length - (matchLength - 1));
    if (keepFrom > 0) this.buffer = this.buffer.subarray(keepFrom);
  }

  private startPart(headerText: string): void {
    this.partsCount++;
    if (this.partsCount > this.limits.parts) {
      this.emit("partsLimit");
      this.skipPart = true;
    } else {
      this.skipPart = false;
    }

    const headers = new Map<string, string>();
    for (const line of headerText.split("\r\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      headers.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
    }

    const disposition = parseContentDisposition(headers.get("content-disposition") ?? "");
    let name = disposition.name ?? "";
    this.fieldNameTruncated = name.length > this.limits.fieldNameSize;
    if (this.fieldNameTruncated) name = name.slice(0, this.limits.fieldNameSize);
    this.fieldName = name;

    this.isFile = disposition.filename !== undefined;
    this.fieldChunks = [];
    this.fieldSize = 0;
    this.fieldTruncated = false;
    this.fileSize = 0;

    if (this.isFile) {
      this.filesCount++;
      this.fileInfo = {
        filename: disposition.filename ?? "",
        encoding: headers.get("content-transfer-encoding") ?? "7bit",
        mimeType: headers.get("content-type") ?? "application/octet-stream",
      };

      if (!this.skipPart && this.filesCount > this.limits.files) {
        this.emit("filesLimit");
        this.skipPart = true;
      }

      if (!this.skipPart) {
        this.sink = new FileSink();
        this.emit("file", this.fieldName, this.sink, this.fileInfo);
      } else {
        this.sink = null;
      }
    } else {
      this.fieldsCount++;
      if (!this.skipPart && this.fieldsCount > this.limits.fields) {
        this.emit("fieldsLimit");
        this.skipPart = true;
      }
      this.sink = null;
    }
  }

  private pushBody(chunk: Buffer): void {
    if (chunk.length === 0 || this.skipPart) return;

    if (this.isFile) {
      if (!this.sink || this.sink.truncated) return;
      const remaining = this.limits.fileSize - this.fileSize;
      if (remaining <= 0) {
        this.sink.truncated = true;
        return;
      }
      if (chunk.length > remaining) {
        this.sink.write(chunk.subarray(0, remaining));
        this.fileSize += remaining;
        this.sink.truncated = true;
        return;
      }
      this.sink.write(chunk);
      this.fileSize += chunk.length;
    } else {
      if (this.fieldTruncated) return;
      const remaining = this.limits.fieldSize - this.fieldSize;
      if (remaining <= 0) {
        this.fieldTruncated = true;
        return;
      }
      const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      this.fieldChunks.push(Buffer.from(slice));
      this.fieldSize += slice.length;
      if (slice.length < chunk.length) this.fieldTruncated = true;
    }
  }

  private finishPart(): void {
    if (this.isFile) {
      this.sink?.end();
      this.sink = null;
    } else if (!this.skipPart) {
      const value = Buffer.concat(this.fieldChunks).toString("utf8");
      const info: FieldEventInfo = {
        nameTruncated: this.fieldNameTruncated,
        valueTruncated: this.fieldTruncated,
      };
      this.emit("field", this.fieldName, value, info);
    }
    this.fieldChunks = [];
  }
}
