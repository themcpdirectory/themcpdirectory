import { randomUUID } from "node:crypto";
import { requestIdSchema } from "@themcpdirectory/api-contract";
import type { MiddlewareHandler } from "hono";
import type { ApiEnv } from "../app.js";

export function attachRequestId(
  requestIdFactory: () => string = randomUUID,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const incoming = c.req.header("x-request-id");
    const requestId =
      incoming && requestIdSchema.safeParse(incoming).success ? incoming : requestIdFactory();
    const validatedRequestId = requestIdSchema.parse(requestId);

    c.set("requestId", validatedRequestId);
    c.header("X-Request-ID", validatedRequestId);
    await next();
  };
}
