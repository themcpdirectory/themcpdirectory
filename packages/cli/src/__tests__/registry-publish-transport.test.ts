import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  createPinnedLookup,
  createPinnedRegistryPublishTransport,
} from "../registry-publish-transport.js";

describe("pinned Registry publish transport", () => {
  it.each([
    ["93.184.216.34", 4],
    ["2606:2800:220:1:248:1893:25c8:1946", 6],
  ] as const)("returns the pinned %s address with family %s", async (address, family) => {
    const lookup = createPinnedLookup(address, family);

    const result = await new Promise<{ readonly address: string; readonly family: number }>(
      (resolve, reject) => {
        lookup("registry.example.test", {}, (error, resolvedAddress, resolvedFamily) => {
          if (error) {
            reject(error);
            return;
          }
          if (typeof resolvedAddress !== "string") {
            reject(new Error("Expected one pinned address"));
            return;
          }
          if (resolvedFamily === undefined) {
            reject(new Error("Expected an address family"));
            return;
          }
          resolve({ address: resolvedAddress, family: resolvedFamily });
        });
      },
    );

    expect(result).toEqual({ address, family });
  });

  it("uses the original hostname for SNI and sends the exact request body", async () => {
    let capturedEndpoint: URL | undefined;
    let capturedOptions: RequestOptions | undefined;
    let responseHandler: ((response: IncomingMessage) => void) | undefined;
    const request = createRequestDouble(() => {
      const response = createResponse(200);
      responseHandler?.(response);
      response.end('{"server":{"name":"example","version":"1.0.0"}}');
    });
    const requestImpl = vi.fn(
      (endpoint: URL, options: RequestOptions, onResponse: (response: IncomingMessage) => void) => {
        capturedEndpoint = endpoint;
        capturedOptions = options;
        responseHandler = onResponse;
        return request;
      },
    );
    const transport = createPinnedRegistryPublishTransport(requestImpl);

    const result = await transport({
      endpoint: new URL("https://registry.example.test/v0/publish"),
      hostname: "registry.example.test",
      resolvedAddresses: ["93.184.216.34"],
      pinnedAddress: "93.184.216.34",
      pinnedAddressFamily: 4,
      method: "POST",
      headers: {
        authorization: "Bearer registry-secret",
        "content-type": "application/json",
      },
      body: '{"name":"example"}',
      timeoutMs: 321,
    });

    expect(capturedEndpoint?.href).toBe("https://registry.example.test/v0/publish");
    expect(capturedOptions).toMatchObject({
      method: "POST",
      servername: "registry.example.test",
      headers: {
        authorization: "Bearer registry-secret",
        "content-type": "application/json",
        "content-length": "18",
      },
    });
    expect(capturedOptions?.lookup).toBeTypeOf("function");
    expect(request.setTimeout).toHaveBeenCalledWith(321, expect.any(Function));
    expect(request.end).toHaveBeenCalledWith('{"name":"example"}');
    expect(result).toEqual({
      status: 200,
      body: '{"server":{"name":"example","version":"1.0.0"}}',
    });
  });

  it("rejects a response declared above one MiB", async () => {
    let responseHandler: ((response: IncomingMessage) => void) | undefined;
    const request = createRequestDouble(() => {
      const response = createResponse(200, { "content-length": String(1024 * 1024 + 1) });
      responseHandler?.(response);
    });
    const transport = createPinnedRegistryPublishTransport((_endpoint, _options, onResponse) => {
      responseHandler = onResponse;
      return request;
    });

    await expect(
      transport({
        endpoint: new URL("https://registry.example.test/v0/publish"),
        hostname: "registry.example.test",
        resolvedAddresses: ["93.184.216.34"],
        pinnedAddress: "93.184.216.34",
        pinnedAddressFamily: 4,
        method: "POST",
        headers: { authorization: "Bearer registry-secret" },
        body: "{}",
        timeoutMs: 100,
      }),
    ).rejects.toThrow("size limit");
  });
});

function createRequestDouble(onEnd: () => void): ClientRequest {
  const request = {
    setTimeout: vi.fn(),
    once: vi.fn(),
    end: vi.fn(() => {
      onEnd();
      return request;
    }),
    destroy: vi.fn(),
  };
  request.setTimeout.mockReturnValue(request);
  request.once.mockReturnValue(request);
  return request as unknown as ClientRequest;
}

function createResponse(
  statusCode: number,
  headers: Readonly<Record<string, string>> = {},
): IncomingMessage & PassThrough {
  const response = new PassThrough() as unknown as IncomingMessage & PassThrough;
  response.statusCode = statusCode;
  response.headers = headers;
  return response;
}
