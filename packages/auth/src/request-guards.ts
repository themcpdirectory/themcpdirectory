import { OriginForbiddenError, UnsupportedContentTypeError } from "./errors.js";

export function assertSameOriginJsonMutation(request: Request, siteOrigin: string): void {
  const origin = request.headers.get("origin");
  if (origin !== siteOrigin) {
    throw new OriginForbiddenError();
  }

  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim();
  if (contentType !== "application/json") {
    throw new UnsupportedContentTypeError();
  }
}
