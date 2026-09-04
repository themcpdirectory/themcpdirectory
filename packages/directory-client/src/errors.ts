export type DirectoryClientErrorCode =
  | "DIRECTORY_HTTP_ERROR"
  | "DIRECTORY_TIMEOUT"
  | "DIRECTORY_INVALID_RESPONSE"
  | "DIRECTORY_AMBIGUOUS"
  | "DIRECTORY_INSTALL_UNAVAILABLE"
  | "DIRECTORY_UPSTREAM_DELETED";

export class DirectoryClientError extends Error {
  constructor(
    readonly code: DirectoryClientErrorCode,
    message: string,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "DirectoryClientError";
  }
}
