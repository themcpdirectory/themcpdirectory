import { randomBytes } from "node:crypto";
import { connect, createServer, type Socket } from "node:net";
import { gzipSync } from "node:zlib";
import { Agent } from "undici";
import { describe, expect, it, vi } from "vitest";
import {
  performPinnedProbe,
  type PinnedProbeRequestOptions,
  type ProbeFetch,
  type ProbeRequestInit,
} from "../remote-probe.js";

const baseOptions = (
  overrides: Partial<PinnedProbeRequestOptions> = {},
): PinnedProbeRequestOptions => ({
  fetchImpl: vi.fn<ProbeFetch>(),
  resolve: async () => ["93.184.216.34"],
  method: "HEAD",
  connectTimeoutMs: 500,
  totalTimeoutMs: 1_500,
  maxRedirects: 2,
  maxHeaderBytes: 512,
  maxResponseBytes: 1_024,
  maxDecompressedBytes: 1_024,
  ...overrides,
});

describe("performPinnedProbe", () => {
  it("rejects non-public addresses, mixed DNS answers, and non-standard ports before fetch", async () => {
    const cases = [
      { answers: ["127.0.0.1"], errorCode: "unsafe_destination" },
      { answers: ["::1"], errorCode: "unsafe_destination" },
      { answers: ["169.254.169.254"], errorCode: "unsafe_destination" },
      { answers: ["10.0.0.2"], errorCode: "unsafe_destination" },
      { answers: ["fd00::1"], errorCode: "unsafe_destination" },
      { answers: ["::ffff:10.0.0.2"], errorCode: "unsafe_destination" },
      { answers: ["93.184.216.34", "10.0.0.2"], errorCode: "mixed_dns" },
    ];

    for (const { answers, errorCode } of cases) {
      const fetchImpl = vi.fn<ProbeFetch>();
      await expect(
        performPinnedProbe(
          "https://origin.example.com/health",
          baseOptions({ fetchImpl, resolve: async () => answers }),
        ),
      ).resolves.toMatchObject({ outcome: "unsafe_destination", errorCode });
      expect(fetchImpl).not.toHaveBeenCalled();
    }

    const fetchImpl = vi.fn<ProbeFetch>();
    const resolve = vi.fn(async () => ["93.184.216.34"]);
    await expect(
      performPinnedProbe(
        "https://origin.example.com:8443/health",
        baseOptions({ fetchImpl, resolve }),
      ),
    ).resolves.toMatchObject({ outcome: "unsafe_destination", errorCode: "unsafe_port" });
    expect(resolve).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("pins TLS dispatchers per redirect hop and rejects rebinding", async () => {
    const dispatcherFactory = vi.fn<NonNullable<PinnedProbeRequestOptions["dispatcherFactory"]>>(
      () => undefined,
    );
    const successfulFetch = vi.fn<ProbeFetch>(async (input) => {
      if (!String(input).endsWith("/health")) return new Response(null, { status: 204 });
      return new Response(
        new ReadableStream<Uint8Array>({
          cancel: () => new Promise<void>(() => {}),
        }),
        {
          status: 302,
          headers: { location: "https://next.example.com/final" },
        },
      );
    });
    const addresses: Record<string, string[]> = {
      "origin.example.com": ["93.184.216.34"],
      "next.example.com": ["1.1.1.1"],
    };

    await expect(
      Promise.race([
        performPinnedProbe(
          "https://origin.example.com/health",
          baseOptions({
            fetchImpl: successfulFetch,
            resolve: async (hostname) => addresses[hostname] ?? [],
            dispatcherFactory,
            totalTimeoutMs: 25,
          }),
        ),
        new Promise((resolve) => setTimeout(() => resolve({ outcome: "cleanup_stalled" }), 100)),
      ]),
    ).resolves.toMatchObject({ outcome: "healthy", redirectCount: 1 });
    expect(dispatcherFactory).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        hostname: "origin.example.com",
        servername: "origin.example.com",
        pinnedAddress: "93.184.216.34",
        maxHeaderBytes: 512,
        maxResponseBytes: 1_024,
      }),
    );
    expect(successfulFetch.mock.calls[0]?.[1]?.dispatcher).toBeDefined();
    expect(dispatcherFactory).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        hostname: "next.example.com",
        servername: "next.example.com",
        pinnedAddress: "1.1.1.1",
      }),
    );

    await expect(
      performPinnedProbe(
        "https://93.184.216.34/health",
        baseOptions({ fetchImpl: successfulFetch, dispatcherFactory }),
      ),
    ).resolves.toMatchObject({ outcome: "healthy" });
    expect(dispatcherFactory.mock.calls[2]?.[0]).not.toHaveProperty("servername");

    let resolveCount = 0;
    const rebindingFetch = vi.fn<ProbeFetch>(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://origin.example.com/final" },
        }),
    );
    await expect(
      performPinnedProbe(
        "https://origin.example.com/health",
        baseOptions({
          fetchImpl: rebindingFetch,
          resolve: async () => (++resolveCount === 1 ? ["93.184.216.34"] : ["10.0.0.2"]),
          dispatcherFactory,
        }),
      ),
    ).resolves.toMatchObject({
      outcome: "unsafe_destination",
      redirectCount: 1,
    });
    expect(rebindingFetch).toHaveBeenCalledTimes(1);

    const unsafeRedirectFetch = vi.fn<ProbeFetch>(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/final" },
        }),
    );
    await expect(
      performPinnedProbe(
        "https://origin.example.com/health",
        baseOptions({ fetchImpl: unsafeRedirectFetch, dispatcherFactory }),
      ),
    ).resolves.toMatchObject({
      outcome: "unsafe_destination",
      errorCode: "https_required",
      redirectCount: 1,
      finalOrigin: "https://origin.example.com",
    });
    expect(unsafeRedirectFetch).toHaveBeenCalledTimes(1);
  });

  it("strips credentials and enforces header, compressed, and body limits", async () => {
    const seenRequests: ProbeRequestInit[] = [];
    const compressedBody = new Uint8Array(gzipSync("x".repeat(2_048)));
    const decompressedBody = new Blob([compressedBody])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    const responses = [
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            throw new Error("response body cancellation failed");
          },
        }),
        { status: 200, headers: { "x-large": "y".repeat(512) } },
      ),
      new Response(null, { status: 200, headers: { "content-length": "2048" } }),
      new Response(decompressedBody, {
        status: 200,
        headers: {
          "content-encoding": "gzip",
          "content-length": String(compressedBody.byteLength),
        },
      }),
      new Response("x".repeat(2_048), { status: 200 }),
    ];
    const fetchImpl = vi.fn<ProbeFetch>(async (_input, init) => {
      if (init) seenRequests.push(init);
      return responses.shift()!;
    });
    const options = baseOptions({ fetchImpl, method: "GET", maxHeaderBytes: 128 });

    for (const errorCode of [
      "header_limit",
      "body_limit",
      "decompressed_body_limit",
      "body_limit",
    ]) {
      await expect(
        performPinnedProbe("https://origin.example.com/health", options),
      ).resolves.toMatchObject({ outcome: "response_too_large", errorCode });
    }

    const wireBody = gzipSync(randomBytes(2_048));
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
      socket.end(
        Buffer.concat([
          Buffer.from(
            "HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n",
          ),
          Buffer.from(`${wireBody.byteLength.toString(16)}\r\n`),
          wireBody,
          Buffer.from("\r\n0\r\n\r\n"),
        ]),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP server address");
    const { fetchImpl: ignoredFetch, ...transportOptions } = baseOptions({
      method: "GET",
      maxResponseBytes: 256,
      maxDecompressedBytes: 4_096,
      dispatcherFactory: () =>
        new Agent({
          maxResponseSize: 256,
          connect: (_connectOptions, callback) => {
            const socket = connect(address.port, "127.0.0.1");
            socket.once("connect", () => callback(null, socket));
            socket.once("error", (error) => callback(error, null));
          },
        }),
    });
    void ignoredFetch;
    try {
      await expect(
        performPinnedProbe("https://origin.example.com/health", transportOptions),
      ).resolves.toMatchObject({ outcome: "response_too_large" });
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    expect(seenRequests[0]).toMatchObject({
      credentials: "omit",
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "application/json, text/event-stream",
        "accept-encoding": "identity",
        "user-agent": "TheMcpDirectoryHealthProbe/1",
      },
    });
  });

  it("classifies connect and total timeout paths", async () => {
    const connectTimeout = vi.fn<ProbeFetch>(async () => {
      throw Object.assign(new Error("connect timed out"), { code: "UND_ERR_CONNECT_TIMEOUT" });
    });
    await expect(
      performPinnedProbe(
        "https://origin.example.com/health",
        baseOptions({ fetchImpl: connectTimeout }),
      ),
    ).resolves.toMatchObject({ outcome: "timed_out", errorCode: "connect_timeout" });
    await expect(
      performPinnedProbe(
        "https://origin.example.com/health",
        baseOptions({ fetchImpl: connectTimeout }),
      ),
    ).resolves.toMatchObject({ finalOrigin: "https://origin.example.com" });

    const totalTimeout = vi.fn<ProbeFetch>(async (_input, init) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
      throw new Error("unreachable");
    });
    await expect(
      performPinnedProbe(
        "https://origin.example.com/health",
        baseOptions({ fetchImpl: totalTimeout, totalTimeoutMs: 1 }),
      ),
    ).resolves.toMatchObject({ outcome: "timed_out", errorCode: "total_timeout" });

    for (const [code, errorCode] of [
      ["UND_ERR_HEADERS_OVERFLOW", "header_limit"],
      ["UND_ERR_RES_EXCEEDED_MAX_SIZE", "response_body_limit"],
    ] as const) {
      const fetchImpl = vi.fn<ProbeFetch>(async () => {
        throw Object.assign(new Error("bounded transport limit"), { code });
      });
      await expect(
        performPinnedProbe("https://origin.example.com/health", baseOptions({ fetchImpl })),
      ).resolves.toMatchObject({ outcome: "response_too_large", errorCode });
    }
  });
});
