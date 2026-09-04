import { describe, expect, it } from "vitest";
import { OriginForbiddenError, UnsupportedContentTypeError } from "../errors.js";
import { assertSameOriginJsonMutation } from "../request-guards.js";

const SITE_ORIGIN = "https://app.example.com";

function makeRequest(headers: Record<string, string>): Request {
  return new Request(SITE_ORIGIN, { method: "POST", headers });
}

describe("assertSameOriginJsonMutation", () => {
  it("allows a same-origin JSON mutation", () => {
    const request = makeRequest({ origin: SITE_ORIGIN, "content-type": "application/json" });
    expect(() => assertSameOriginJsonMutation(request, SITE_ORIGIN)).not.toThrow();
  });

  it("allows a JSON content type carrying a charset parameter", () => {
    const request = makeRequest({
      origin: SITE_ORIGIN,
      "content-type": "application/json; charset=utf-8",
    });
    expect(() => assertSameOriginJsonMutation(request, SITE_ORIGIN)).not.toThrow();
  });

  it("rejects a cross-origin request", () => {
    const request = makeRequest({
      origin: "https://evil.example",
      "content-type": "application/json",
    });
    expect(() => assertSameOriginJsonMutation(request, SITE_ORIGIN)).toThrow(OriginForbiddenError);
  });

  it("rejects a request missing the origin header", () => {
    const request = makeRequest({ "content-type": "application/json" });
    expect(() => assertSameOriginJsonMutation(request, SITE_ORIGIN)).toThrow(OriginForbiddenError);
  });

  it("rejects a non-JSON content type", () => {
    const request = makeRequest({ origin: SITE_ORIGIN, "content-type": "text/plain" });
    expect(() => assertSameOriginJsonMutation(request, SITE_ORIGIN)).toThrow(
      UnsupportedContentTypeError,
    );
  });
});
