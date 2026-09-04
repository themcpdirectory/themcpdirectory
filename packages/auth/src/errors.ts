export type AuthErrorCode = "AUTH_REQUIRED" | "ORIGIN_FORBIDDEN" | "UNSUPPORTED_CONTENT_TYPE";

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

export class AuthRequiredError extends AuthError {
  constructor() {
    super("AUTH_REQUIRED", "A valid session is required to access this resource.");
    this.name = "AuthRequiredError";
  }
}

export class OriginForbiddenError extends AuthError {
  constructor() {
    super("ORIGIN_FORBIDDEN", "The request origin does not match the configured site origin.");
    this.name = "OriginForbiddenError";
  }
}

export class UnsupportedContentTypeError extends AuthError {
  constructor() {
    super(
      "UNSUPPORTED_CONTENT_TYPE",
      "Mutation requests must use the application/json content type.",
    );
    this.name = "UnsupportedContentTypeError";
  }
}
