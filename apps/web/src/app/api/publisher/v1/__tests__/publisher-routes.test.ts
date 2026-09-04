import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as callback } from "../claims/verify/callback/route.js";
import { POST as createClaim } from "../claims/route.js";
import { GET as authRouteGet, POST as authRoutePost } from "../../../auth/[...all]/route.js";
import * as authModule from "@themcpdirectory/auth";
import * as domainModule from "@themcpdirectory/domain";
import { buildGitHubUserAuthorisationUrl } from "../_shared/route-helpers.js";
import {
  decryptPkceVerifierCiphertext,
  encryptPkceVerifierCiphertext,
  sha256Base64Url,
} from "../_shared/pkce-crypto.js";

describe("publisher routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects cross-origin JSON mutations", async () => {
    const request = new Request("http://localhost:3099/api/publisher/v1/claims", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        serverId: "11111111-1111-4111-8111-111111111111",
        publisherId: "22222222-2222-4222-8222-222222222222",
        verificationMethod: "github_repository",
      }),
    });

    const response = await createClaim(request as never, { params: Promise.resolve({}) } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ORIGIN_FORBIDDEN" } });
  });

  it("treats the GitHub callback as a same-origin exception but still binds it to the current session", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/test");
    vi.stubEnv("MCP_REGISTRY_BASE_URL", "https://registry.modelcontextprotocol.io");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://localhost:3099");
    vi.stubEnv("BETTER_AUTH_SECRET", "01234567890123456789012345678901");
    vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("GITHUB_APP_ID", "12345");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "test-private-key");
    vi.stubEnv("GITHUB_APP_SLUG", "test-app");

    vi.spyOn(authModule, "requireSession").mockResolvedValue({
      user: { id: "33333333-3333-4333-8333-333333333333" },
    } as never);
    const completeSpy = vi
      .spyOn(domainModule, "completePublisherClaimVerification")
      .mockResolvedValue({
        claimId: "claim-1",
        status: "verified",
        publisherId: "publisher-1",
        serverId: "11111111-1111-4111-8111-111111111111",
        githubSubjectType: "repository",
        returnTo: "/dashboard/listings/11111111-1111-4111-8111-111111111111",
      });

    const response = await callback(
      new Request(
        "http://localhost:3099/api/publisher/v1/claims/verify/callback?state=state-ref-123.state-nonce-123&code=test-code&installation_id=91&setup_action=install",
      ) as never,
    );

    expect(completeSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requesterUserId: "33333333-3333-4333-8333-333333333333",
        state: "state-ref-123.state-nonce-123",
        code: "test-code",
        installationId: 91,
      }),
      expect.anything(),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(
      "/dashboard/listings/11111111-1111-4111-8111-111111111111",
    );
  });

  it("redirects to the canonical NEXT_PUBLIC_BASE_URL origin even with a hostile request Host, and rejects a malformed callback query", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/test");
    vi.stubEnv("MCP_REGISTRY_BASE_URL", "https://registry.modelcontextprotocol.io");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://themcpdirectory.org");
    vi.stubEnv("BETTER_AUTH_SECRET", "01234567890123456789012345678901");
    vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("GITHUB_APP_ID", "12345");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "test-private-key");
    vi.stubEnv("GITHUB_APP_SLUG", "test-app");

    vi.spyOn(authModule, "requireSession").mockResolvedValue({
      user: { id: "33333333-3333-4333-8333-333333333333" },
    } as never);
    vi.spyOn(domainModule, "completePublisherClaimVerification").mockResolvedValue({
      claimId: "claim-1",
      status: "verified",
      publisherId: "publisher-1",
      serverId: "11111111-1111-4111-8111-111111111111",
      githubSubjectType: "repository",
      returnTo: "/dashboard/listings/11111111-1111-4111-8111-111111111111",
    });

    const hostileResponse = await callback(
      new Request(
        "https://attacker.example/api/publisher/v1/claims/verify/callback?state=state-ref-123.state-nonce-123&code=test-code",
      ) as never,
    );

    expect(hostileResponse.status).toBe(303);
    expect(hostileResponse.headers.get("location")).toMatch(/^https:\/\/themcpdirectory\.org\//);

    const invalidResponse = await callback(
      new Request(
        "https://themcpdirectory.org/api/publisher/v1/claims/verify/callback?state=state-ref-123.state-nonce-123&code=test-code&installation_id=not-a-number",
      ) as never,
    );

    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });
});

describe("buildGitHubUserAuthorisationUrl", () => {
  it("includes allow_signup=false so GitHub cannot create a new account mid-flow", () => {
    const url = buildGitHubUserAuthorisationUrl({
      clientId: "client-id",
      state: "state-value",
      redirectUri: "http://localhost:3099/api/publisher/v1/claims/verify/callback",
      codeChallenge: "challenge-value",
    });

    expect(new URL(url).searchParams.get("allow_signup")).toBe("false");
  });
});

describe("auth route mount", () => {
  it("does not require WebEnv at import time (getAuth() is called lazily per request)", () => {
    expect(typeof authRouteGet).toBe("function");
    expect(typeof authRoutePost).toBe("function");
  });
});

describe("pkce crypto", () => {
  it("produces the RFC 7636 Appendix B S256 code_challenge for the reference verifier", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(sha256Base64Url(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("round-trips the PKCE verifier through BETTER_AUTH_SECRET-derived AES-256-GCM encryption", () => {
    const secret = "01234567890123456789012345678901";
    const verifier = "test-code-verifier-value";

    const ciphertext = encryptPkceVerifierCiphertext(verifier, secret);

    expect(ciphertext).not.toContain(verifier);
    expect(decryptPkceVerifierCiphertext(ciphertext, secret)).toBe(verifier);
  });

  it("fails to decrypt with the wrong secret", () => {
    const ciphertext = encryptPkceVerifierCiphertext(
      "verifier",
      "01234567890123456789012345678901",
    );

    expect(() =>
      decryptPkceVerifierCiphertext(ciphertext, "11111111111111111111111111111111"),
    ).toThrow();
  });
});
