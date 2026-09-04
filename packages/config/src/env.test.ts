import { describe, it, expect } from "vitest";
import { loadApiEnv, loadEnv, loadWebEnv, resolveWebUrls } from "./env.js";

const BASE_ENV = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
  API_CURSOR_SIGNING_SECRET: "phase-d-secret-phase-d-secret-phase-d-secret",
};

describe("loadEnv", () => {
  it("returns parsed env when all required vars are present", () => {
    const env = loadEnv(BASE_ENV);
    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
    expect(env.MCP_REGISTRY_BASE_URL).toBe("https://registry.modelcontextprotocol.io");
  });

  it("defaults WEB_PORT to 3000 when not set", () => {
    const env = loadEnv(BASE_ENV);
    expect(env.WEB_PORT).toBe(3000);
  });

  it("defaults API_PORT to 3001 when not set", () => {
    const env = loadEnv(BASE_ENV);
    expect(env.API_PORT).toBe(3001);
  });

  it("parses Phase D API defaults", () => {
    const env = loadApiEnv(BASE_ENV);
    expect(env.API_BASE_URL).toBe("http://127.0.0.1:3001");
    expect(env.API_CORS_ALLOWED_ORIGINS).toEqual(["*"]);
    expect(env.API_RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    expect(env.API_RATE_LIMIT_MAX_READS).toBe(120);
  });

  it("parses and trims an explicit CORS allowlist", () => {
    const env = loadApiEnv({
      ...BASE_ENV,
      API_CORS_ALLOWED_ORIGINS: "https://one.example, https://two.example ",
    });
    expect(env.API_CORS_ALLOWED_ORIGINS).toEqual(["https://one.example", "https://two.example"]);
  });

  it("requires a sufficiently long cursor signing secret", () => {
    expect(() => loadApiEnv({ ...BASE_ENV, API_CURSOR_SIGNING_SECRET: "too-short" })).toThrow();
  });

  it.each([
    "",
    "*,https://one.example",
    "not-an-origin",
    "ftp://files.example",
    "https://one.example/path",
    "https://one.example?query=value",
  ])("rejects an invalid CORS allowlist: %s", (value) => {
    expect(() => loadApiEnv({ ...BASE_ENV, API_CORS_ALLOWED_ORIGINS: value })).toThrow();
  });

  it("keeps API-only settings optional for workers, migrations, and seeds", () => {
    const env = loadEnv({
      DATABASE_URL: BASE_ENV.DATABASE_URL,
      MCP_REGISTRY_BASE_URL: BASE_ENV.MCP_REGISTRY_BASE_URL,
    });
    expect(env.DATABASE_URL).toBe(BASE_ENV.DATABASE_URL);
  });

  it("coerces WEB_PORT string to number", () => {
    const env = loadEnv({ ...BASE_ENV, WEB_PORT: "8080" });
    expect(env.WEB_PORT).toBe(8080);
  });

  it("treats GITHUB_TOKEN as optional", () => {
    const env = loadEnv(BASE_ENV);
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });

  it("includes GITHUB_TOKEN when provided", () => {
    const env = loadEnv({ ...BASE_ENV, GITHUB_TOKEN: "ghp_token123" });
    expect(env.GITHUB_TOKEN).toBe("ghp_token123");
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() =>
      loadEnv({
        MCP_REGISTRY_BASE_URL: BASE_ENV.MCP_REGISTRY_BASE_URL,
        API_CURSOR_SIGNING_SECRET: BASE_ENV.API_CURSOR_SIGNING_SECRET,
      }),
    ).toThrow();
  });

  it("throws when MCP_REGISTRY_BASE_URL is missing", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: BASE_ENV.DATABASE_URL,
        API_CURSOR_SIGNING_SECRET: BASE_ENV.API_CURSOR_SIGNING_SECRET,
      }),
    ).toThrow();
  });

  it("throws when DATABASE_URL is not a URL", () => {
    expect(() => loadEnv({ ...BASE_ENV, DATABASE_URL: "not-a-url" })).toThrow();
  });
});

describe("loadWebEnv", () => {
  it("keeps web/auth variables out of loadEnv and requires them in loadWebEnv", () => {
    const shared = loadEnv({
      DATABASE_URL: "postgresql://localhost:5432/themcpdirectory",
      MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
    });

    expect(shared).not.toHaveProperty("NEXT_PUBLIC_BASE_URL");

    expect(() =>
      loadWebEnv({
        DATABASE_URL: "postgresql://localhost:5432/themcpdirectory",
        MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
        NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rejects a Better Auth URL with a different origin than the canonical site origin", () => {
    expect(() =>
      resolveWebUrls(
        loadWebEnv({
          DATABASE_URL: "postgresql://localhost:5432/themcpdirectory",
          MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
          NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
          BETTER_AUTH_URL: "https://auth.example.com/api/auth",
          BETTER_AUTH_SECRET: "01234567890123456789012345678901",
          GITHUB_CLIENT_ID: "github-client-id",
          GITHUB_CLIENT_SECRET: "github-client-secret",
          GITHUB_APP_ID: "12345",
          GITHUB_APP_PRIVATE_KEY: "test-private-key",
          GITHUB_APP_SLUG: "themcpdirectory",
        }),
      ),
    ).toThrow(/same origin/i);
  });
});
