export interface FilenestFile {
  fieldName: string;
  originalName: string;
  encoding: string;
  mimeType: string;
  size: number;
  /** Set by memoryStorage. Absent when diskStorage is used. */
  buffer?: Buffer;
  /** Set by diskStorage. Absent when memoryStorage is used. */
  path?: string;
  /** Set by diskStorage. Absent when memoryStorage is used. */
  destination?: string;
  /** Set by diskStorage. Absent when memoryStorage is used. */
  filename?: string;
}

export interface FilenestLimits {
  /** Max size of each field value, in bytes. */
  fieldSize?: number;
  /** Max number of non-file fields. */
  fields?: number;
  /** Max size of each file, in bytes. */
  fileSize?: number;
  /** Max number of file fields (across all field names). */
  files?: number;
  /** Max number of parts (fields + files) in the whole request. */
  parts?: number;
}

export type FileFilter = (
  fieldName: string,
  file: Pick<FilenestFile, "fieldName" | "originalName" | "encoding" | "mimeType">
) => boolean | Promise<boolean>;

export interface StorageEngineHandle {
  write(chunk: Buffer): void;
  end(): Promise<{ path?: string; destination?: string; filename?: string; buffer?: Buffer; size: number }>;
  abort(): Promise<void>;
}

export interface StorageEngine {
  handleFile(
    fieldName: string,
    meta: { originalName: string; encoding: string; mimeType: string }
  ): StorageEngineHandle | Promise<StorageEngineHandle>;
}

export interface FilenestOptions {
  storage?: StorageEngine;
  limits?: FilenestLimits;
  fileFilter?: FileFilter;
  preservePath?: boolean;
}

export type FieldSpec = { name: string; maxCount?: number };
