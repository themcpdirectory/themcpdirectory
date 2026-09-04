import { afterEach, describe, expect, it, vi } from "vitest";
import { toNextJsHandler } from "better-auth/next-js";

const TEST_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
  NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "a".repeat(32),
  GITHUB_CLIENT_ID: "github-client-id",
  GITHUB_CLIENT_SECRET: "github-client-secret",
  GITHUB_APP_ID: "12345",
  GITHUB_APP_PRIVATE_KEY: "test-private-key",
  GITHUB_APP_SLUG: "themcpdirectory",
};

function stubTestEnv(): void {
  for (const [key, value] of Object.entries(TEST_ENV)) {
    vi.stubEnv(key, value);
  }
}

describe("Better Auth Next.js integration compatibility", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes a getAuth() accessor that returns a real object with a handler function", async () => {
    stubTestEnv();
    const mod = (await import("../better-auth.js")) as {
      getAuth?: () => { handler: (req: Request) => Promise<Response> };
    };

    expect(typeof mod.getAuth).toBe("function");
    const instance = mod.getAuth!();

    // Regression: toNextJsHandler probes `"handler" in auth` at request time
    // and falls through to `auth(request)` when the check is false. A Proxy
    // with an empty target and no `has` trap would fail this check and then
    // crash with `auth is not a function` on the fallback call.
    expect("handler" in instance).toBe(true);
    expect(typeof instance.handler).toBe("function");

    const routes = toNextJsHandler(instance as never);
    expect(typeof routes.GET).toBe("function");
    expect(typeof routes.POST).toBe("function");
  });

  it("returns a real object whose own keys mirror createAuth() output", async () => {
    stubTestEnv();
    const mod = (await import("../better-auth.js")) as {
      getAuth?: () => object;
      createAuth: (input: { db: unknown; env: unknown }) => object;
    };
    const { createDatabase } = await import("@themcpdirectory/db");
    const { loadWebEnv } = await import("@themcpdirectory/config");

    const env = loadWebEnv();
    const reference = mod.createAuth({ db: createDatabase(env.DATABASE_URL), env });
    const instance = mod.getAuth!();

    expect(Reflect.ownKeys(instance).sort()).toEqual(Reflect.ownKeys(reference).sort());
  });

  it("memoizes so repeated getAuth() calls return the same instance", async () => {
    stubTestEnv();
    const mod = (await import("../better-auth.js")) as { getAuth?: () => object };
    expect(mod.getAuth!()).toBe(mod.getAuth!());
  });
});
