import { cliTelemetryEventV1Schema } from "@themcpdirectory/api-contract";
import { recordCliTelemetryEvent, TelemetryServerNotFoundError } from "@themcpdirectory/domain";
import type { Hono } from "hono";
import type { ApiDependencies, ApiEnv } from "../app.js";
import { HttpApiError } from "../http/errors.js";

const MAX_TELEMETRY_BODY_BYTES = 1_024;

export function registerTelemetryRoutes(api: Hono<ApiEnv>, deps: ApiDependencies): void {
  api.post("/telemetry/events", async (context) => {
    const contentType = context.req.header("content-type")?.split(";", 1)[0]?.trim();
    const contentLength = Number(context.req.header("content-length") ?? 0);
    if (
      contentType !== "application/json" ||
      !Number.isFinite(contentLength) ||
      contentLength > MAX_TELEMETRY_BODY_BYTES
    ) {
      throw new HttpApiError("VALIDATION_ERROR");
    }

    const text = await context.req.text();
    if (Buffer.byteLength(text, "utf8") > MAX_TELEMETRY_BODY_BYTES) {
      throw new HttpApiError("VALIDATION_ERROR");
    }

    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch {
      throw new HttpApiError("VALIDATION_ERROR");
    }
    const parsed = cliTelemetryEventV1Schema.safeParse(input);
    if (!parsed.success) throw new HttpApiError("VALIDATION_ERROR");

    try {
      await recordCliTelemetryEvent(deps.db, parsed.data);
    } catch (error) {
      if (error instanceof TelemetryServerNotFoundError) {
        throw new HttpApiError("VALIDATION_ERROR");
      }
      throw error;
    }

    return context.body(null, 202);
  });
}
