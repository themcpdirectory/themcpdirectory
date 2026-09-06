import { request as httpsRequest, type RequestOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";

const MAX_RESPONSE_BODY_BYTES = 1024 * 1024;

export interface RegistryPublishRequest {
  readonly endpoint: URL;
  readonly hostname: string;
  readonly resolvedAddresses: readonly string[];
  readonly pinnedAddress: string;
  readonly pinnedAddressFamily: 4 | 6;
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly timeoutMs: number;
}

export interface RegistryPublishResponse {
  readonly status: number;
  readonly body: string;
}

export type RegistryPublishTransport = (
  request: RegistryPublishRequest,
) => Promise<RegistryPublishResponse>;

export function createPinnedLookup(
  address: string,
  family: 4 | 6,
): NonNullable<RequestOptions["lookup"]> {
  return (_hostname, _options, callback) => {
    callback(null, address, family);
  };
}

type HttpsRequest = (
  endpoint: URL,
  options: RequestOptions,
  onResponse: (response: IncomingMessage) => void,
) => ClientRequest;

export function createPinnedRegistryPublishTransport(
  requestImpl: HttpsRequest = httpsRequest,
): RegistryPublishTransport {
  return (input) =>
    new Promise((resolve, reject) => {
      const request = requestImpl(
        input.endpoint,
        {
          method: input.method,
          headers: {
            ...input.headers,
            "content-length": String(Buffer.byteLength(input.body)),
          },
          servername: input.hostname,
          lookup: createPinnedLookup(input.pinnedAddress, input.pinnedAddressFamily),
        },
        (response) => consumeResponse(response, resolve, reject),
      );

      request.setTimeout(input.timeoutMs, () => {
        request.destroy(new Error("Registry request timed out"));
      });
      request.once("error", reject);
      request.end(input.body);
    });
}

function consumeResponse(
  response: IncomingMessage,
  resolve: (response: RegistryPublishResponse) => void,
  reject: (error: Error) => void,
): void {
  const declaredLength = Number(response.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BODY_BYTES) {
    response.destroy();
    reject(new Error("Registry response body exceeded the size limit"));
    return;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  response.on("data", (chunk: Buffer | string) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_RESPONSE_BODY_BYTES) {
      response.destroy();
      reject(new Error("Registry response body exceeded the size limit"));
      return;
    }
    chunks.push(buffer);
  });
  response.once("error", reject);
  response.once("end", () => {
    resolve({
      status: response.statusCode ?? 0,
      body: Buffer.concat(chunks).toString("utf8"),
    });
  });
}
