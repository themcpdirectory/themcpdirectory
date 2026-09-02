import { randomUUID } from "node:crypto";
import { errorResponseSchema, type ApiErrorCode } from "@themcpdirectory/api-contract";
import {
  AmbiguousServerIdentifierError,
  InstallManifestUnavailableError,
  ServerNotFoundError,
  UpstreamDeletedError,
} from "@themcpdirectory/domain";
import { InvalidCursorError } from "@themcpdirectory/search";
import type { ErrorHandler } from "hono";
import type { ApiEnv, ApiLogger } from "../app.js";

type HttpApiStatus = 400 | 404 | 409 | 410 | 429 | 500;

const PUBLIC_ERRORS = {
  VALIDATION_ERROR: { status: 400, message: "Validation failed" },
  SERVER_NOT_FOUND: { status: 404, message: "Server not found" },
  AMBIGUOUS_SERVER: { status: 409, message: "Identifier matches multiple servers" },
  INSTALL_UNAVAILABLE: { status: 410, message: "Install manifest is unavailable" },
  UPSTREAM_DELETED: { status: 410, message: "Listing was deleted upstream" },
  CURSOR_INVALID: { status: 400, message: "Cursor is invalid" },
  RATE_LIMITED: { status: 429, message: "Too many requests" },
  INTERNAL_ERROR: { status: 500, message: "Internal server error" },
} as const satisfies Record<ApiErrorCode, { status: HttpApiStatus; message: string }>;

export class HttpApiError extends Error {
  readonly status: HttpApiStatus;

  constructor(readonly code: ApiErrorCode) {
    const definition = PUBLIC_ERRORS[code];
    super(definition.message);
    this.status = definition.status;
    this.name = "HttpApiError";
  }
}

function toHttpApiError(error: unknown): HttpApiError {
  if (error instanceof HttpApiError) return error;
  if (error instanceof InvalidCursorError) {
    return new HttpApiError("CURSOR_INVALID");
  }
  if (error instanceof AmbiguousServerIdentifierError) {
    return new HttpApiError("AMBIGUOUS_SERVER");
  }
  if (error instanceof ServerNotFoundError) {
    return new HttpApiError("SERVER_NOT_FOUND");
  }
  if (error instanceof UpstreamDeletedError) {
    return new HttpApiError("UPSTREAM_DELETED");
  }
  if (error instanceof InstallManifestUnavailableError) {
    return new HttpApiError("INSTALL_UNAVAILABLE");
  }
  return new HttpApiError("INTERNAL_ERROR");
}

export function createErrorHandler(logger: ApiLogger): ErrorHandler<ApiEnv> {
  return (error, c) => {
    const httpError = toHttpApiError(error);
    const requestId = c.get("requestId") ?? randomUUID();

    logger.error({
      event: "api_error",
      requestId,
      route: c.req.routePath,
      status: httpError.status,
      code: httpError.code,
    });

    const body = errorResponseSchema.parse({
      error: {
        code: httpError.code,
        message: httpError.message,
        requestId,
      },
    });
    const headers = new Headers({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
    });
    const retryAfter = c.get("rateLimitRetryAfter");
    if (httpError.status === 429 && retryAfter !== undefined) {
      headers.set("Retry-After", String(retryAfter));
    }

    return new Response(JSON.stringify(body), {
      status: httpError.status,
      headers,
    });
  };
}
