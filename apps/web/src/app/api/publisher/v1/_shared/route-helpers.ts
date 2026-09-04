import { z } from "zod";
import {
  AuthError,
  assertSameOriginJsonMutation,
  requireSession,
  type AuthErrorCode,
  type AuthenticatedSession,
} from "@themcpdirectory/auth";
import {
  PublisherClaimAuthorityError,
  PublisherClaimConflictError,
  PublisherClaimTransitionError,
} from "@themcpdirectory/domain";
import { getSiteOrigin } from "@/lib/site-url";

const AUTH_ERROR_STATUS: Record<AuthErrorCode, number> = {
  AUTH_REQUIRED: 401,
  ORIGIN_FORBIDDEN: 403,
  UNSUPPORTED_CONTENT_TYPE: 415,
};

const CLAIM_TRANSITION_ERROR_STATUS: Record<
  "NOT_FOUND" | "FORBIDDEN" | "INVALID_TRANSITION" | "EXPIRED",
  number
> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_TRANSITION: 409,
  EXPIRED: 410,
};

const MEMBERSHIP_MUTATION_ERROR_STATUS: Record<string, number> = {
  MEMBERSHIP_NOT_FOUND: 404,
  LAST_OWNER: 409,
  PUBLISHER_FORBIDDEN: 403,
};

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** UUID-shaped identifiers used by every publisher route's path params/body fields. */
export const uuidSchema = z.uuid();

/** Runs a Zod schema and maps any failure to the shared, safe ValidationError response. */
export function parseWithSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const label = issue && issue.path.length > 0 ? issue.path.join(".") : "value";
    throw new ValidationError(issue ? `${label}: ${issue.message}` : "Invalid request.");
  }
  return parsed.data;
}

/** Validates a dynamic route segment (e.g. `claimId`, `membershipId`) is UUID-shaped. */
export function parseUuidRouteParam(value: string, fieldName: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(`${fieldName} must be a valid UUID.`);
  }
  return parsed.data;
}

/** Same-origin JSON check for mutations, then the current Better Auth session. */
export async function requirePublisherRouteSession(
  request: Request,
): Promise<AuthenticatedSession> {
  if (request.method !== "GET") {
    assertSameOriginJsonMutation(request, getSiteOrigin());
  }

  return requireSession(request.headers);
}

/** The GitHub callback is the only same-origin-JSON exception, but still requires a session. */
export async function requirePublisherCallbackSession(
  request: Request,
): Promise<AuthenticatedSession> {
  return requireSession(request.headers);
}

export function privateJson(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: {
      "cache-control": "private, no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export function publisherRouteErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return privateJson(
      { error: { code: error.code, message: error.message } },
      { status: AUTH_ERROR_STATUS[error.code] },
    );
  }

  if (error instanceof ValidationError) {
    return privateJson(
      { error: { code: "VALIDATION_ERROR", message: error.message } },
      { status: 400 },
    );
  }

  if (error instanceof PublisherClaimConflictError) {
    return privateJson(
      { error: { code: "PUBLISHER_CLAIM_CONFLICT", message: error.message } },
      { status: 409 },
    );
  }

  if (error instanceof PublisherClaimAuthorityError) {
    return privateJson(
      { error: { code: "PUBLISHER_CLAIM_MEMBERSHIP_REQUIRED", message: error.message } },
      { status: 403 },
    );
  }

  if (error instanceof PublisherClaimTransitionError) {
    return privateJson(
      { error: { code: `PUBLISHER_CLAIM_${error.reason}`, message: error.message } },
      { status: CLAIM_TRANSITION_ERROR_STATUS[error.reason] },
    );
  }

  if (error instanceof Error) {
    const status = MEMBERSHIP_MUTATION_ERROR_STATUS[error.message];
    if (status !== undefined) {
      return privateJson({ error: { code: error.message, message: error.message } }, { status });
    }
  }

  // Unknown failures must never leak internals (stack traces, driver errors) to the client.
  console.error("publisher route failure", error);
  return privateJson(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    { status: 500 },
  );
}

export interface ClaimVerificationCallbackParams {
  readonly state: string;
  readonly code: string;
  readonly installationId: number | null;
  readonly setupAction: "install" | "request" | null;
}

const claimVerificationCallbackQuerySchema = z.object({
  state: z.string().min(1),
  code: z.string().min(1),
  installation_id: z.coerce.number().int().positive().nullable(),
  setup_action: z.enum(["install", "request"]).nullable(),
});

export function parseClaimVerificationCallback(url: URL): ClaimVerificationCallbackParams {
  const parsed = claimVerificationCallbackQuerySchema.safeParse({
    state: url.searchParams.get("state"),
    code: url.searchParams.get("code"),
    installation_id: url.searchParams.get("installation_id"),
    setup_action: url.searchParams.get("setup_action"),
  });
  if (!parsed.success) {
    throw new ValidationError("GITHUB_CALLBACK_INVALID");
  }

  return {
    state: parsed.data.state,
    code: parsed.data.code,
    installationId: parsed.data.installation_id,
    setupAction: parsed.data.setup_action,
  };
}

export function buildGitHubUserAuthorisationUrl(input: {
  readonly clientId: string;
  readonly state: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
}): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}
