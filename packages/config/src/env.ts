import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  MCP_REGISTRY_BASE_URL: z.string().url(),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  API_PORT: z.coerce.number().int().positive().default(3001),
  GITHUB_TOKEN: z.string().optional(),
});

const ApiEnvSchema = EnvSchema.extend({
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

export type Env = z.infer<typeof EnvSchema>;
export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export function loadEnv(raw: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(raw);
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
