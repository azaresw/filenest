export type FilenestErrorCode =
  | "LIMIT_FILE_SIZE"
  | "LIMIT_FILE_COUNT"
  | "LIMIT_FIELD_KEY"
  | "LIMIT_FIELD_VALUE"
  | "LIMIT_FIELD_COUNT"
  | "LIMIT_UNEXPECTED_FILE"
  | "LIMIT_PART_COUNT"
  | "FILE_REJECTED";

export class FilenestError extends Error {
  code: FilenestErrorCode;
  field?: string;

  constructor(code: FilenestErrorCode, field?: string, message?: string) {
    super(message ?? code);
    this.name = "FilenestError";
    this.code = code;
    this.field = field;
    Error.captureStackTrace?.(this, FilenestError);
  }
}
