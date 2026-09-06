import type { CliTelemetryEventV1 } from "@themcpdirectory/api-contract";

export interface TelemetryReporter {
  report(event: CliTelemetryEventV1): Promise<void>;
}

export interface TelemetryReporterOptions {
  readonly apiBaseUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

const DEFAULT_TELEMETRY_TIMEOUT_MS = 400;
const MAX_TELEMETRY_TIMEOUT_MS = 500;

export function createTelemetryReporter(options: TelemetryReporterOptions): TelemetryReporter {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = Math.min(
    Math.max(1, options.timeoutMs ?? DEFAULT_TELEMETRY_TIMEOUT_MS),
    MAX_TELEMETRY_TIMEOUT_MS,
  );
  const endpoint = resolveTelemetryEndpoint(options.apiBaseUrl);

  return {
    async report(event): Promise<void> {
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve();
        }, timeoutMs);
        timeout.unref?.();
      });
      const request = fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
        signal: controller.signal,
      })
        .then(() => undefined)
        .catch(() => undefined);

      try {
        await Promise.race([request, timeoutPromise]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    },
  };
}

function resolveTelemetryEndpoint(apiBaseUrl: string): URL {
  const base = new URL(apiBaseUrl);
  base.hash = "";
  base.search = "";
  const segments = base.pathname.split("/").filter(Boolean);
  if (segments.at(-2) === "api" && segments.at(-1) === "v1") {
    base.pathname = `/${segments.join("/")}/`;
  } else {
    base.pathname = `/${[...segments, "api", "v1"].join("/")}/`;
  }
  return new URL("telemetry/events", base);
}
