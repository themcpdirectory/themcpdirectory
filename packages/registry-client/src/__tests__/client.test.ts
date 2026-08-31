import { describe, expect, it } from "vitest";
import { OfficialRegistryClient } from "../client.js";
import type { RegistryClientOptions, RegistryError } from "../client.js";
import {
  VALID_REGISTRY_PAGE,
  VALID_EMPTY_PAGE,
  VALID_LAST_PAGE,
} from "../__fixtures__/registry-page.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function makeClient(
  opts: Partial<RegistryClientOptions> & { fetch: NonNullable<RegistryClientOptions["fetch"]> },
): OfficialRegistryClient {
  return new OfficialRegistryClient({
    baseUrl: "https://registry.modelcontextprotocol.io",
    timeoutMs: 5_000,
    maxRetries: 2,
    maxRedirects: 3,
    maxResponseBytes: 10 * 1024 * 1024,
    sleep: async () => {},
    ...opts,
  });
}

describe("OfficialRegistryClient.pages()", () => {
  describe("cursor pagination", () => {
    it("yields pages and follows nextCursor", async () => {
      let callCount = 0;
      const client = makeClient({
        fetch: async (input) => {
          callCount++;
          const url = new URL(typeof input === "string" ? input : (input as Request).url);
          if (!url.searchParams.has("cursor")) {
            return jsonResponse(VALID_REGISTRY_PAGE);
          }
          return jsonResponse(VALID_LAST_PAGE);
        },
      });

      const pages = [];
      for await (const page of client.pages()) {
        pages.push(page);
      }
      expect(pages).toHaveLength(2);
      expect(callCount).toBe(2);
    });

    it("starts from a provided cursor", async () => {
      const client = makeClient({
        fetch: async (input) => {
          const url = new URL(typeof input === "string" ? input : (input as Request).url);
          expect(url.searchParams.get("cursor")).toBe("start-here");
          return jsonResponse(VALID_LAST_PAGE);
        },
      });

      const pages = [];
      for await (const page of client.pages({ cursor: "start-here" })) {
        pages.push(page);
      }
      expect(pages).toHaveLength(1);
    });

    it("terminates on empty nextCursor", async () => {
      const client = makeClient({
        fetch: async () => jsonResponse(VALID_EMPTY_PAGE),
      });

      const pages = [];
      for await (const page of client.pages()) {
        pages.push(page);
      }
      expect(pages).toHaveLength(1);
    });

    it("detects cursor loops", async () => {
      const client = makeClient({
        fetch: async () => jsonResponse(VALID_REGISTRY_PAGE),
      });

      const pages = [];
      try {
        for await (const page of client.pages()) {
          pages.push(page);
          if (pages.length > 5) throw new Error("should have thrown by now");
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        expect(err.kind).toBe("cursor_loop");
      }
    });
  });

  describe("retries", () => {
    it("retries on 429 with bounded Retry-After", async () => {
      let attempts = 0;
      const client = makeClient({
        fetch: async () => {
          attempts++;
          if (attempts === 1) {
            return new Response("rate limited", {
              status: 429,
              headers: { "retry-after": "1", "content-type": "text/plain" },
            });
          }
          return jsonResponse(VALID_LAST_PAGE);
        },
      });

      const pages = [];
      for await (const page of client.pages()) {
        pages.push(page);
      }
      expect(pages).toHaveLength(1);
      expect(attempts).toBe(2);
    });

    it("retries on 500", async () => {
      let attempts = 0;
      const client = makeClient({
        fetch: async () => {
          attempts++;
          if (attempts === 1) {
            return new Response("error", {
              status: 500,
              headers: { "content-type": "text/plain" },
            });
          }
          return jsonResponse(VALID_LAST_PAGE);
        },
      });

      const pages = [];
      for await (const page of client.pages()) {
        pages.push(page);
      }
      expect(pages).toHaveLength(1);
      expect(attempts).toBe(2);
    });

    it("retries on 408/425/502/503/504", async () => {
      for (const status of [408, 425, 502, 503, 504]) {
        let attempts = 0;
        const client = makeClient({
          fetch: async () => {
            attempts++;
            if (attempts === 1) {
              return new Response("error", { status, headers: { "content-type": "text/plain" } });
            }
            return jsonResponse(VALID_LAST_PAGE);
          },
        });

        const pages = [];
        for await (const page of client.pages()) {
          pages.push(page);
        }
        expect(pages).toHaveLength(1);
      }
    });

    it("does NOT retry 400/401/403/404", async () => {
      for (const status of [400, 401, 403, 404]) {
        const client = makeClient({
          fetch: async () =>
            new Response("client error", { status, headers: { "content-type": "text/plain" } }),
        });

        try {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _ of client.pages()) {
            /* should not yield */
          }
          expect.unreachable("should have thrown");
        } catch (e) {
          const err = e as RegistryError;
          expect(err.kind).toBe("http");
          expect(err.retryable).toBe(false);
        }
      }
    });

    it("fails after maxRetries exhausted", async () => {
      const client = makeClient({
        maxRetries: 2,
        fetch: async () =>
          new Response("error", { status: 500, headers: { "content-type": "text/plain" } }),
      });

      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of client.pages()) {
          /* noop */
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        expect(err.kind).toBe("http");
        expect(err.retryable).toBe(true);
        expect(err.attempt).toBe(3);
      }
    });

    it("caps Retry-After to prevent abuse", async () => {
      const sleepCalls: number[] = [];
      let attempts = 0;
      const client = makeClient({
        fetch: async () => {
          attempts++;
          if (attempts === 1) {
            return new Response("rate limited", {
              status: 429,
              headers: { "retry-after": "99999", "content-type": "text/plain" },
            });
          }
          return jsonResponse(VALID_LAST_PAGE);
        },
        sleep: async (ms) => {
          sleepCalls.push(ms);
        },
      });

      const pages = [];
      for await (const page of client.pages()) {
        pages.push(page);
      }
      expect(sleepCalls[0]).toBeLessThanOrEqual(60_000);
    });
  });

  describe("timeout", () => {
    it("aborts on timeout via AbortController", async () => {
      const client = makeClient({
        timeoutMs: 50,
        fetch: async (_input, init) => {
          const signal = init?.signal;
          return new Promise((_resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("should have been aborted")), 10_000);
            signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(signal.reason ?? new DOMException("aborted", "AbortError"));
            });
          });
        },
      });

      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of client.pages()) {
          /* noop */
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        expect(err.kind).toBe("timeout");
      }
    });
  });

  describe("network errors", () => {
    it("retries on network errors", async () => {
      let attempts = 0;
      const client = makeClient({
        fetch: async () => {
          attempts++;
          if (attempts === 1) {
            throw new TypeError("fetch failed");
          }
          return jsonResponse(VALID_LAST_PAGE);
        },
      });

      const pages = [];
      for await (const page of client.pages()) {
        pages.push(page);
      }
      expect(pages).toHaveLength(1);
      expect(attempts).toBe(2);
    });
  });

  describe("response body size", () => {
    it("rejects oversized responses", async () => {
      const client = makeClient({
        maxResponseBytes: 100,
        fetch: async () =>
          new Response("x".repeat(200), {
            status: 200,
            headers: { "content-type": "application/json", "content-length": "200" },
          }),
      });

      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of client.pages()) {
          /* noop */
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        expect(err.kind).toBe("response_too_large");
      }
    });
  });

  describe("content type validation", () => {
    it("rejects non-JSON content type", async () => {
      const client = makeClient({
        fetch: async () =>
          new Response("<html>bad</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      });

      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of client.pages()) {
          /* noop */
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        expect(err.kind).toBe("invalid_content_type");
      }
    });
  });

  describe("validation errors", () => {
    it("rejects malformed JSON", async () => {
      const client = makeClient({
        fetch: async () =>
          new Response("{invalid", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      });

      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of client.pages()) {
          /* noop */
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        expect(err.kind).toBe("parse");
      }
    });

    it("rejects schema-invalid response without retry", async () => {
      const client = makeClient({
        fetch: async () => jsonResponse({ bad: "shape" }),
      });

      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of client.pages()) {
          /* noop */
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        expect(err.kind).toBe("validation");
        expect(err.retryable).toBe(false);
      }
    });
  });

  describe("typed errors", () => {
    it("never leaks response bodies in error messages", async () => {
      const secretBody = JSON.stringify({ secret: "SUPER_SECRET_TOKEN" });
      const client = makeClient({
        fetch: async () =>
          new Response(secretBody, {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
      });

      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of client.pages()) {
          /* noop */
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        const serialized = JSON.stringify(err);
        expect(serialized).not.toContain("SUPER_SECRET_TOKEN");
      }
    });
  });
});
