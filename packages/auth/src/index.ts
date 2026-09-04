export { createAuth, getAuth } from "./better-auth.js";
export type { Auth, CreateAuthInput } from "./better-auth.js";

export { roleHasCapability } from "./capabilities.js";
export type { PublisherCapability, PublisherRole } from "./capabilities.js";

export { getSessionOrNull, requireSession } from "./session.js";
export type { AuthenticatedSession } from "./session.js";

export { assertSameOriginJsonMutation } from "./request-guards.js";

export {
  AuthError,
  AuthRequiredError,
  OriginForbiddenError,
  UnsupportedContentTypeError,
} from "./errors.js";
export type { AuthErrorCode } from "./errors.js";
