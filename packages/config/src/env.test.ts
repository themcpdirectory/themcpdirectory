import { describe, it, expect } from "vitest";
import { loadEnv } from "./env.js";

const BASE_ENV = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  MCP_REGISTRY_BASE_URL: "https://registry.modelcontextprotocol.io",
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
    expect(() => loadEnv({ MCP_REGISTRY_BASE_URL: BASE_ENV.MCP_REGISTRY_BASE_URL })).toThrow();
  });

  it("throws when MCP_REGISTRY_BASE_URL is missing", () => {
    expect(() => loadEnv({ DATABASE_URL: BASE_ENV.DATABASE_URL })).toThrow();
  });

  it("throws when DATABASE_URL is not a URL", () => {
    expect(() => loadEnv({ ...BASE_ENV, DATABASE_URL: "not-a-url" })).toThrow();
  });
});
