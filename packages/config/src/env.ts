import { z } from "zod";

export const PUBLISHER_RETENTION_DEFAULTS = Object.freeze({
  auditDays: 730,
  claimExpiryDays: 30,
  claimEvidenceDays: 90,
  outboxDays: 30,
  expiredSessionGraceDays: 7,
  dormantAccountDays: 365,
});

const RetentionEnvSchema = z.object({
  PUBLISHER_AUDIT_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(PUBLISHER_RETENTION_DEFAULTS.auditDays),
  PUBLISHER_CLAIM_EXPIRY_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(PUBLISHER_RETENTION_DEFAULTS.claimExpiryDays),
  PUBLISHER_CLAIM_EVIDENCE_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(PUBLISHER_RETENTION_DEFAULTS.claimEvidenceDays),
  PUBLISHER_OUTBOX_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(PUBLISHER_RETENTION_DEFAULTS.outboxDays),
  PUBLISHER_EXPIRED_SESSION_GRACE_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(PUBLISHER_RETENTION_DEFAULTS.expiredSessionGraceDays),
  PUBLISHER_DORMANT_ACCOUNT_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(PUBLISHER_RETENTION_DEFAULTS.dormantAccountDays),
});

const SharedEnvSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    MCP_REGISTRY_BASE_URL: z.string().url(),
    WEB_PORT: z.coerce.number().int().positive().default(3000),
    API_PORT: z.coerce.number().int().positive().default(3001),
    GITHUB_TOKEN: z.string().optional(),
  })
  .merge(RetentionEnvSchema);

const ApiEnvSchema = SharedEnvSchema.extend({
  API_BASE_URL: z.string().url().default("http://127.0.0.1:3001"),
  API_CORS_ALLOWED_ORIGINS: z
    .string()
    .default("*")
    .transform((value, context) => {
      const origins = value.split(",").map((origin) => origin.trim());
      const isWildcard = origins.length === 1 && origins[0] === "*";
      const areCanonicalOrigins = origins.every((origin) => {
        try {
          const parsed = new URL(origin);
          return ["http:", "https:"].includes(parsed.protocol) && parsed.origin === origin;
        } catch {
          return false;
        }
      });

      if (!isWildcard && (!origins.length || !areCanonicalOrigins)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid CORS origin allowlist" });
        return z.NEVER;
      }
      return origins;
    }),
  API_CURSOR_SIGNING_SECRET: z.string().min(32),
  API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  API_RATE_LIMIT_MAX_READS: z.coerce.number().int().positive().default(120),
});

const WebAuthEnvSchema = SharedEnvSchema.extend({
  NEXT_PUBLIC_BASE_URL: z.string().url(),
  BETTER_AUTH_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_APP_ID: z.string().regex(/^\d+$/),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  GITHUB_APP_SLUG: z.string().min(1),
}).superRefine((env, ctx) => {
  const siteOrigin = new URL(env.NEXT_PUBLIC_BASE_URL).origin;
  const authBaseURL =
    env.BETTER_AUTH_URL || new URL("/api/auth", env.NEXT_PUBLIC_BASE_URL).toString();

  if (new URL(authBaseURL).origin !== siteOrigin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["BETTER_AUTH_URL"],
      message: "BETTER_AUTH_URL must share the same origin as NEXT_PUBLIC_BASE_URL.",
    });
  }
});

export type DirectoryEnv = z.infer<typeof SharedEnvSchema>;
export type ApiEnv = z.infer<typeof ApiEnvSchema>;
export type WebEnv = z.infer<typeof WebAuthEnvSchema>;

export function loadEnv(raw: Record<string, string | undefined> = process.env): DirectoryEnv {
  const result = SharedEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}

export function loadApiEnv(raw: Record<string, string | undefined> = process.env): ApiEnv {
  const result = ApiEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid API environment configuration: ${result.error.message}`);
  }
  return result.data;
}

export function loadWebEnv(raw: Record<string, string | undefined> = process.env): WebEnv {
  const result = WebAuthEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid web environment configuration: ${result.error.message}`);
  }
  return result.data;
}

export function resolveWebUrls(env: Pick<WebEnv, "NEXT_PUBLIC_BASE_URL" | "BETTER_AUTH_URL">): {
  siteOrigin: string;
  authBaseURL: string;
  trustedOrigins: readonly string[];
} {
  const siteOrigin = new URL(env.NEXT_PUBLIC_BASE_URL).origin;
  const authBaseURL =
    env.BETTER_AUTH_URL || new URL("/api/auth", env.NEXT_PUBLIC_BASE_URL).toString();

  if (new URL(authBaseURL).origin !== siteOrigin) {
    throw new Error("BETTER_AUTH_URL must share the same origin as NEXT_PUBLIC_BASE_URL.");
  }

  return { siteOrigin, authBaseURL, trustedOrigins: [siteOrigin] };
}
