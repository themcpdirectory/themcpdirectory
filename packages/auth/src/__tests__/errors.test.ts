import { describe, expect, it } from "vitest";
import {
  AuthError,
  AuthRequiredError,
  OriginForbiddenError,
  UnsupportedContentTypeError,
} from "../errors.js";

describe("typed auth errors", () => {
  it("tags AuthRequiredError with the AUTH_REQUIRED code and the Error prototype chain", () => {
    const error = new AuthRequiredError();
    expect(error).toBeInstanceOf(AuthError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("AUTH_REQUIRED");
  });

  it("tags OriginForbiddenError with the ORIGIN_FORBIDDEN code", () => {
    const error = new OriginForbiddenError();
    expect(error).toBeInstanceOf(AuthError);
    expect(error.code).toBe("ORIGIN_FORBIDDEN");
  });

  it("tags UnsupportedContentTypeError with the UNSUPPORTED_CONTENT_TYPE code", () => {
    const error = new UnsupportedContentTypeError();
    expect(error).toBeInstanceOf(AuthError);
    expect(error.code).toBe("UNSUPPORTED_CONTENT_TYPE");
  });
});
