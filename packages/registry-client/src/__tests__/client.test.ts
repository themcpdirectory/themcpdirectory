import { describe, expect, it } from "vitest";
import { OfficialRegistryClient, RegistryError } from "../client.js";
import type { RegistryClientOptions } from "../client.js";
import { validatePublicHttpUrl } from "@themcpdirectory/security";
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

    it("stores cause via standard ErrorOptions.cause", () => {
      const original = new TypeError("boom");
      const err = new RegistryError({
        kind: "network",
        message: "wrapped",
        retryable: true,
        attempt: 1,
        cause: original,
      });
      expect(err.cause).toBe(original);
      expect(err.message).toBe("wrapped");
    });
  });

  describe("redirect following", () => {
    function redirectResponse(status: number, location?: string): Response {
      const headers = new Headers();
      if (location !== undefined) headers.set("location", location);
      return new Response(null, { status, headers });
    }

    it("follows a public relative redirect to success", async () => {
      const fetchedUrls: string[] = [];
      const client = makeClient({
        validateUrl: async (url) => ({ ok: true as const, url }),
        fetch: async (input) => {
          const url = typeof input === "string" ? input : (input as Request).url;
          fetchedUrls.push(url);
          if (fetchedUrls.length === 1) {
            return redirectResponse(302, "/v0.1/servers?redirected=1");
          }
          return jsonResponse(VALID_LAST_PAGE);
        },
      });

      const pages = [];
      for await (const page of client.pages()) {
        pages.push(page);
      }
      expect(pages).toHaveLength(1);
      expect(fetchedUrls).toHaveLength(2);
      expect(fetchedUrls[1]).toContain("redirected=1");
    });

    it("blocks redirect to private IP and never fetches the target", async () => {
      const fetchedUrls: string[] = [];
      const client = makeClient({
        validateUrl: validatePublicHttpUrl,
        fetch: async (input) => {
          const url = typeof input === "string" ? input : (input as Request).url;
          fetchedUrls.push(url);
          return redirectResponse(302, "http://192.168.1.1/evil");
        },
      });

      try {
        for await (const _page of client.pages()) {
          void _page;
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        expect(err.kind).toBe("redirect_unsafe");
        expect(err.retryable).toBe(false);
      }
      expect(fetchedUrls).toHaveLength(1);
      expect(fetchedUrls.every((u) => !u.includes("192.168.1.1"))).toBe(true);
    });

    it("rejects missing Location header on redirect status", async () => {
      const client = makeClient({
        validateUrl: async (url) => ({ ok: true as const, url }),
        fetch: async () => redirectResponse(302),
      });

      try {
        for await (const _page of client.pages()) {
          void _page;
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        expect(err.kind).toBe("redirect_invalid");
        expect(err.retryable).toBe(false);
      }
    });

    it("rejects malformed Location URL", async () => {
      const client = makeClient({
        validateUrl: async (url) => ({ ok: true as const, url }),
        fetch: async () => redirectResponse(302, "http://[::bad"),
      });

      try {
        for await (const _page of client.pages()) {
          void _page;
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        expect(err.kind).toBe("redirect_invalid");
        expect(err.retryable).toBe(false);
      }
    });

    it("enforces hop limit", async () => {
      let hop = 0;
      const client = makeClient({
        maxRedirects: 3,
        validateUrl: async (url) => ({ ok: true as const, url }),
        fetch: async () => {
          hop++;
          return redirectResponse(302, `/v0.1/servers?hop=${hop}`);
        },
      });

      try {
        for await (const _page of client.pages()) {
          void _page;
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        expect(err.kind).toBe("redirect_limit");
        expect(err.retryable).toBe(false);
      }
    });

    it("detects redirect loops", async () => {
      const client = makeClient({
        maxRedirects: 10,
        validateUrl: async (url) => ({ ok: true as const, url }),
        fetch: async (input) => {
          const url = typeof input === "string" ? input : (input as Request).url;
          if (url.includes("hop=a")) {
            return redirectResponse(302, "/v0.1/servers?hop=b");
          }
          if (url.includes("hop=b")) {
            return redirectResponse(302, "/v0.1/servers?hop=a");
          }
          return redirectResponse(302, "/v0.1/servers?hop=a");
        },
      });

      try {
        for await (const _page of client.pages()) {
          void _page;
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        expect(err.kind).toBe("redirect_loop");
        expect(err.retryable).toBe(false);
      }
    });

    it("does not follow non-standard 3xx statuses", async () => {
      const client = makeClient({
        validateUrl: async (url) => ({ ok: true as const, url }),
        fetch: async () => new Response(null, { status: 300 }),
      });

      try {
        for await (const _page of client.pages()) {
          void _page;
        }
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as RegistryError;
        expect(err.kind).toBe("http");
      }
    });

    it("shares one timeout budget across redirect chain", async () => {
      const signals: (AbortSignal | null | undefined)[] = [];
      const client = makeClient({
        validateUrl: async (url) => ({ ok: true as const, url }),
        fetch: async (input, init) => {
          signals.push(init?.signal);
          if (signals.length === 1) {
            return redirectResponse(302, "/v0.1/servers?hop=1");
          }
          return jsonResponse(VALID_LAST_PAGE);
        },
      });

      for await (const _page of client.pages()) {
        void _page;
      }
      expect(signals).toHaveLength(2);
      expect(signals[0]).toBe(signals[1]);
    });
  });

  describe("Retry-After HTTP-date", () => {
    it("parses future HTTP-date and sleeps the correct delta", async () => {
      let attempts = 0;
      const sleepMs: number[] = [];
      const client = makeClient({
        clock: () => Date.parse("Wed, 01 Sep 2026 00:00:30 GMT"),
        fetch: async () => {
          attempts++;
          if (attempts === 1) {
            return new Response("rate limited", {
              status: 429,
              headers: {
                "retry-after": "Wed, 01 Sep 2026 00:01:00 GMT",
                "content-type": "text/plain",
              },
            });
          }
          return jsonResponse(VALID_LAST_PAGE);
        },
        sleep: async (ms) => {
          sleepMs.push(ms);
        },
      });

      const pages = [];
      for await (const page of client.pages()) {
        pages.push(page);
      }
      expect(sleepMs[0]).toBe(30_000);
    });

    it("clamps past HTTP-date to zero delay", async () => {
      let attempts = 0;
      const sleepMs: number[] = [];
      const client = makeClient({
        clock: () => Date.parse("Wed, 01 Sep 2026 01:00:00 GMT"),
        fetch: async () => {
          attempts++;
          if (attempts === 1) {
            return new Response("rate limited", {
              status: 429,
              headers: {
                "retry-after": "Wed, 01 Sep 2026 00:00:00 GMT",
                "content-type": "text/plain",
              },
            });
          }
          return jsonResponse(VALID_LAST_PAGE);
        },
        sleep: async (ms) => {
          sleepMs.push(ms);
        },
      });

      const pages = [];
      for await (const page of client.pages()) {
        pages.push(page);
      }
      expect(sleepMs[0]).toBe(0);
    });

    it("caps far-future HTTP-date to MAX_RETRY_AFTER_MS", async () => {
      let attempts = 0;
      const sleepMs: number[] = [];
      const client = makeClient({
        clock: () => Date.parse("Wed, 01 Sep 2026 00:00:00 GMT"),
        fetch: async () => {
          attempts++;
          if (attempts === 1) {
            return new Response("rate limited", {
              status: 429,
              headers: {
                "retry-after": "Wed, 01 Sep 2026 10:00:00 GMT",
                "content-type": "text/plain",
              },
            });
          }
          return jsonResponse(VALID_LAST_PAGE);
        },
        sleep: async (ms) => {
          sleepMs.push(ms);
        },
      });

      const pages = [];
      for await (const page of client.pages()) {
        pages.push(page);
      }
      expect(sleepMs[0]).toBeLessThanOrEqual(60_000);
    });

    it("falls back to backoff on invalid Retry-After string", async () => {
      let attempts = 0;
      const sleepMs: number[] = [];
      const client = makeClient({
        clock: () => Date.parse("Wed, 01 Sep 2026 00:00:00 GMT"),
        fetch: async () => {
          attempts++;
          if (attempts === 1) {
            return new Response("rate limited", {
              status: 429,
              headers: { "retry-after": "not-a-date-or-number", "content-type": "text/plain" },
            });
          }
          return jsonResponse(VALID_LAST_PAGE);
        },
        sleep: async (ms) => {
          sleepMs.push(ms);
        },
      });

      const pages = [];
      for await (const page of client.pages()) {
        pages.push(page);
      }
      // Should fall back to exponential backoff: 1000 * 2^0 = 1000
      expect(sleepMs[0]).toBe(1_000);
    });
  });
});
