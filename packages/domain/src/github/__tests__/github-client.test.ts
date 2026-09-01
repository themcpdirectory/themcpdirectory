import { describe, expect, it } from "vitest";
import {
  GitHubRepositoryUnavailableError,
  GitHubResponseValidationError,
  GitHubTimeoutError,
  fetchLatestGitHubRelease,
  fetchGitHubRepository,
} from "../github-client.js";

const VALID_REPOSITORY = {
  id: 12_345_678,
  name: "server",
  full_name: "example/server",
  html_url: "https://github.com/example/server",
  default_branch: "main",
  archived: false,
  fork: false,
  stargazers_count: 42,
  forks_count: 7,
  open_issues_count: 3,
  license: { spdx_id: "MIT" },
  pushed_at: "2026-08-31T10:00:00Z",
  owner: { login: "example" },
};

describe("fetchGitHubRepository", () => {
  it("validates repository responses and sends optional authentication", async () => {
    const requests: Request[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json(VALID_REPOSITORY);
    };

    const result = await fetchGitHubRepository("example", "server", {
      fetchImpl,
      token: "test-token",
    });

    expect(result.id).toBe(12_345_678);
    expect(result.owner.login).toBe("example");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer test-token");
    expect(requests[0]?.headers.get("accept")).toBe("application/vnd.github+json");
  });

  it("rejects malformed successful responses", async () => {
    const fetchImpl: typeof fetch = async () => Response.json({ id: "not-a-number" });

    await expect(fetchGitHubRepository("example", "server", { fetchImpl })).rejects.toBeInstanceOf(
      GitHubResponseValidationError,
    );
  });

  it("returns a typed unavailable error for missing repositories", async () => {
    const fetchImpl: typeof fetch = async () =>
      Response.json({ message: "Not Found" }, { status: 404 });

    await expect(fetchGitHubRepository("example", "missing", { fetchImpl })).rejects.toBeInstanceOf(
      GitHubRepositoryUnavailableError,
    );
  });

  it("returns rate-limit reset metadata", async () => {
    const fetchImpl: typeof fetch = async () =>
      Response.json(
        { message: "API rate limit exceeded" },
        {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1788170400" },
        },
      );

    await expect(fetchGitHubRepository("example", "server", { fetchImpl })).rejects.toMatchObject({
      name: "GitHubRateLimitError",
      resetAt: new Date("2026-08-31T10:00:00.000Z"),
    });
  });

  it("recognizes secondary rate limits from Retry-After", async () => {
    const fetchImpl: typeof fetch = async () =>
      Response.json(
        { message: "You have exceeded a secondary rate limit" },
        {
          status: 403,
          headers: {
            "retry-after": "Mon, 31 Aug 2026 10:05:00 GMT",
            "x-ratelimit-remaining": "42",
          },
        },
      );

    await expect(fetchGitHubRepository("example", "server", { fetchImpl })).rejects.toMatchObject({
      name: "GitHubRateLimitError",
      resetAt: new Date("2026-08-31T10:05:00.000Z"),
    });
  });

  it("aborts requests after the configured timeout", async () => {
    const fetchImpl: typeof fetch = async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });

    await expect(
      fetchGitHubRepository("example", "server", { fetchImpl, timeoutMs: 1 }),
    ).rejects.toBeInstanceOf(GitHubTimeoutError);
  });

  it("aborts response body consumption after the configured timeout", async () => {
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), {
            once: true,
          });
        },
      });
      return new Response(body, { status: 200 });
    };

    await expect(
      fetchGitHubRepository("example", "server", { fetchImpl, timeoutMs: 1 }),
    ).rejects.toBeInstanceOf(GitHubTimeoutError);
  });
});

describe("fetchLatestGitHubRelease", () => {
  it("validates release timestamps", async () => {
    const fetchImpl: typeof fetch = async () =>
      Response.json({ id: 99, published_at: "2026-08-30T12:00:00Z" });

    await expect(fetchLatestGitHubRelease("example", "server", { fetchImpl })).resolves.toEqual({
      id: 99,
      published_at: "2026-08-30T12:00:00Z",
    });
  });

  it("returns null when no release exists", async () => {
    const fetchImpl: typeof fetch = async () =>
      Response.json({ message: "Not Found" }, { status: 404 });

    await expect(fetchLatestGitHubRelease("example", "server", { fetchImpl })).resolves.toBeNull();
  });

  it("rejects malformed release responses", async () => {
    const fetchImpl: typeof fetch = async () =>
      Response.json({ id: 99, published_at: "not-a-date" });

    await expect(
      fetchLatestGitHubRelease("example", "server", { fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubResponseValidationError);
  });
});
