import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  MCP_REGISTRY_BASE_URL: z.string().url(),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  API_PORT: z.coerce.number().int().positive().default(3001),
  GITHUB_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(raw: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
