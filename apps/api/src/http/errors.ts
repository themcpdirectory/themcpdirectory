import { randomUUID } from "node:crypto";
import {
  errorResponseSchema,
  PUBLIC_API_ERROR_DEFINITIONS,
  PUBLIC_API_RATE_LIMIT_RESPONSE,
  type ApiErrorCode,
  type ApiErrorStatus,
} from "@themcpdirectory/api-contract";
import {
  AmbiguousServerIdentifierError,
  InstallManifestUnavailableError,
  ServerNotFoundError,
  UpstreamDeletedError,
} from "@themcpdirectory/domain";
import { InvalidCursorError } from "@themcpdirectory/search";
import type { ErrorHandler } from "hono";
import type { ApiEnv, ApiLogger } from "../app.js";

export class HttpApiError extends Error {
  readonly status: ApiErrorStatus;

  constructor(readonly code: ApiErrorCode) {
    const definition = PUBLIC_API_ERROR_DEFINITIONS[code];
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
    if (httpError.status === PUBLIC_API_RATE_LIMIT_RESPONSE.status && retryAfter !== undefined) {
      headers.set(PUBLIC_API_RATE_LIMIT_RESPONSE.header.name, String(retryAfter));
    }

    return new Response(JSON.stringify(body), {
      status: httpError.status,
      headers,
    });
  };
}
