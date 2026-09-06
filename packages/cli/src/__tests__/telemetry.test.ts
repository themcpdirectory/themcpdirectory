import type { CliTelemetryEventV1, ServerCollectionResponse } from "@themcpdirectory/api-contract";
import { createAdapterRegistry } from "@themcpdirectory/client-adapters";
import { createInProcessCliHarness } from "@themcpdirectory/test-utils";
import { describe, expect, it, vi } from "vitest";
import { CLI_VERSION, runCli } from "../cli.js";
import { reportTelemetry } from "../command-dispatch.js";
import type { CliDependencies } from "../dependencies.js";
import { createSuccessResult, withTelemetry } from "../commands/result.js";
import { createTelemetryReporter } from "../telemetry.js";

const SEARCH_RESPONSE: ServerCollectionResponse = {
  data: [],
  meta: { requestId: "req_search", nextCursor: null },
};

const EVENT: CliTelemetryEventV1 = {
  schemaVersion: 1,
  event: "search",
  cliVersion: "0.2.1",
  success: true,
};

describe("CLI telemetry reporter", () => {
  it("posts one exact JSON event to the telemetry endpoint", async () => {
    const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      requests.push({ url: input.toString(), ...(init ? { init } : {}) });
      return new Response(null, { status: 202 });
    });
    const reporter = createTelemetryReporter({
      apiBaseUrl: "https://directory.example/api/v1",
      fetchImpl,
      timeoutMs: 200,
    });

    await reporter.report(EVENT);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://directory.example/api/v1/telemetry/events");
    expect(requests[0]?.init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(EVENT),
    });
    expect(requests[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("swallows network and non-success status failures without retrying", async () => {
    const networkFetch = vi.fn(async () => {
      throw new Error("private network details");
    });
    const statusFetch = vi.fn(async () => new Response(null, { status: 503 }));

    await expect(
      createTelemetryReporter({
        apiBaseUrl: "https://directory.example",
        fetchImpl: networkFetch,
        timeoutMs: 200,
      }).report(EVENT),
    ).resolves.toBeUndefined();
    await expect(
      createTelemetryReporter({
        apiBaseUrl: "https://directory.example",
        fetchImpl: statusFetch,
        timeoutMs: 200,
      }).report(EVENT),
    ).resolves.toBeUndefined();

    expect(networkFetch).toHaveBeenCalledTimes(1);
    expect(statusFetch).toHaveBeenCalledTimes(1);
  });

  it("stops waiting within the configured short timeout", async () => {
    vi.useFakeTimers();
    const requestSignals: AbortSignal[] = [];
    const fetchImpl: typeof fetch = vi.fn(
      async (_input, init) =>
        new Promise<Response>(() => {
          requestSignals.push(init?.signal as AbortSignal);
        }),
    );
    const reporter = createTelemetryReporter({
      apiBaseUrl: "https://directory.example",
      fetchImpl,
      timeoutMs: 5_000,
    });

    const reporting = reporter.report(EVENT);
    await vi.advanceTimersByTimeAsync(500);

    await expect(reporting).resolves.toBeUndefined();
    expect(requestSignals[0]?.aborted).toBe(true);
    vi.useRealTimers();
  });
});

describe("CLI telemetry dispatch", () => {
  it.each(["DO_NOT_TRACK", "MCPDIR_DISABLE_TELEMETRY"] as const)(
    "does not invoke a side-effecting telemetry factory when %s is 1",
    async (variable) => {
      const telemetryFactory = vi.fn(() => [{ event: "search" as const, success: true }]);
      const result = withTelemetry(
        createSuccessResult("search", SEARCH_RESPONSE),
        telemetryFactory,
      );
      const harness = searchHarness([], { [variable]: "1" });
      await reportTelemetry(result, harness.deps);

      expect(telemetryFactory).not.toHaveBeenCalled();
    },
  );

  it("invokes the telemetry factory once and reports exact events when enabled", async () => {
    const events: CliTelemetryEventV1[] = [];
    const telemetryFactory = vi.fn(() => [{ event: "search" as const, success: true }]);
    const result = withTelemetry(createSuccessResult("search", SEARCH_RESPONSE), telemetryFactory);
    const harness = searchHarness(events);
    await reportTelemetry(result, harness.deps);

    expect(telemetryFactory).toHaveBeenCalledTimes(1);
    expect(events).toEqual([EVENT]);
  });

  it("reports the exact package version and privacy-minimal search event", async () => {
    const events: CliTelemetryEventV1[] = [];
    const harness = searchHarness(events);

    const exitCode = await runCli(["search", "private query", "--json"], harness.deps);

    expect(exitCode).toBe(0);
    expect(events).toEqual([
      {
        schemaVersion: 1,
        event: "search",
        cliVersion: CLI_VERSION,
        success: true,
      },
    ]);
    expect(new Set(Object.keys(events[0]!))).toEqual(
      new Set(["schemaVersion", "event", "cliVersion", "success"]),
    );
    expect(harness.stdout).toEqual([
      `${JSON.stringify({
        schemaVersion: 1,
        command: "search",
        ok: true,
        data: SEARCH_RESPONSE,
        warnings: [],
      })}\n`,
    ]);
    expect(harness.stderr).toEqual([]);
  });

  it.each(["DO_NOT_TRACK", "MCPDIR_DISABLE_TELEMETRY"] as const)(
    "makes zero reporter calls when %s is 1",
    async (variable) => {
      const events: CliTelemetryEventV1[] = [];
      const harness = searchHarness(events, { [variable]: "1" });

      await runCli(["search", "private query"], harness.deps);

      expect(events).toEqual([]);
    },
  );

  it("preserves output and exit code when the reporter throws", async () => {
    const harness = searchHarness(
      [],
      {},
      {
        async report() {
          throw new Error("collector unavailable");
        },
      },
    );

    const exitCode = await runCli(["search", "private query"], harness.deps);

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(["No servers found.\n", "Request ID: req_search\n"]);
    expect(harness.stderr).toEqual([]);
  });
});

function searchHarness(
  events: CliTelemetryEventV1[],
  environment: Readonly<NodeJS.ProcessEnv> = {},
  telemetryReporter: CliDependencies["telemetryReporter"] = {
    async report(event) {
      events.push(event);
    },
  },
) {
  return createInProcessCliHarness<CliDependencies>({
    directoryClient: {
      async searchServers() {
        return SEARCH_RESPONSE;
      },
    } as unknown as CliDependencies["directoryClient"],
    adapterRegistry: createAdapterRegistry([]),
    environment,
    telemetryReporter,
  });
}
