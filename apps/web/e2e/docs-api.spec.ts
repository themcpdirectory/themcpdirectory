import { test, expect } from "@playwright/test";

test("API docs project the complete verified public contract", async ({ page }) => {
  await page.goto("/docs/api");

  await expect(page.getByRole("region", { name: "Routes" }).locator("p")).toHaveText([
    "GET /api/v1/categories",
    "GET /api/v1/categories/:slug",
    "GET /api/v1/clients",
    "GET /api/v1/clients/:id",
    "GET /api/v1/publishers/:slug",
    "GET /api/v1/resolve/:identifier",
    "GET /api/v1/resolve/:identifier/install",
    "GET /api/v1/search",
    "GET /api/v1/servers",
    "GET /api/v1/servers/:slug",
    "GET /api/v1/servers/:slug/install",
  ]);
  await expect(page.getByRole("region", { name: "Errors" }).locator("p")).toHaveText([
    "400 VALIDATION_ERROR: Validation failed",
    "404 SERVER_NOT_FOUND: Server not found",
    "409 AMBIGUOUS_SERVER: Identifier matches multiple servers",
    "410 INSTALL_UNAVAILABLE: Install manifest is unavailable",
    "410 UPSTREAM_DELETED: Listing was deleted upstream",
    "400 CURSOR_INVALID: Cursor is invalid",
    "429 RATE_LIMITED: Too many requests",
    "500 INTERNAL_ERROR: Internal server error",
  ]);
  await expect(page.getByRole("region", { name: "Response envelopes" })).toContainText(
    "meta.nextCursor",
  );
  await expect(page.getByRole("region", { name: "Response envelopes" }).locator("p")).toHaveText([
    "Resource: data; meta.requestId.",
    "Collection: data[]; meta.requestId; meta.nextCursor.",
    "Error: error.code; error.message; error.requestId; error.details[]?.",
  ]);
  await expect(page.getByRole("region", { name: "Pagination" })).toContainText(
    "limit defaults to 30; minimum 1; maximum 100",
  );
  await expect(page.getByRole("region", { name: "Pagination" })).toContainText(
    "cursor is opaque, optional, and at most 2048 characters",
  );
  await expect(page.getByRole("region", { name: "Rate limits" })).toContainText(
    "Retry-After reports seconds until retry; quota is configuration-dependent",
  );
  await expect(page.getByRole("region", { name: "Example", exact: true })).toContainText(
    '"code": "RATE_LIMITED"',
  );
  await expect(page.getByRole("region", { name: "Install safety" })).toContainText(
    "Package versions must be exact immutable versions",
  );
  await expect(page.getByRole("region", { name: "Install safety" })).toContainText(
    "secret values are never returned",
  );
  await expect(page.getByRole("region", { name: "Install safety" }).locator("p")).toHaveText([
    "Install URLs allow only http and https.",
    "Package versions must be exact immutable versions only.",
    "Environment variable metadata contains references only; secret values are never returned.",
  ]);

  const expectedOperations = [
    [
      "GET /api/v1/categories",
      [
        "Parameters: none.",
        "Responses: 200, 429, 500.",
        "Success schema: CategoriesCollectionResponse.",
      ],
    ],
    [
      "GET /api/v1/categories/:slug",
      [
        "Parameter: slug; in path; required; maximum length 128; pattern ^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$.",
        "Parameter: cursor; in query; optional; minimum length 1; maximum length 2048.",
        "Parameter: limit; in query; optional; default 30; minimum 1; maximum 100.",
        "Responses: 200, 400, 404, 429, 500.",
        "Success schema: CategoryDetailResponse.",
      ],
    ],
    [
      "GET /api/v1/clients",
      [
        "Parameters: none.",
        "Responses: 200, 429, 500.",
        "Success schema: ClientsCollectionResponse.",
      ],
    ],
    [
      "GET /api/v1/clients/:id",
      [
        "Parameter: id; in path; required; allowed claude-code, codex, cursor, vscode.",
        "Parameter: cursor; in query; optional; minimum length 1; maximum length 2048.",
        "Parameter: limit; in query; optional; default 30; minimum 1; maximum 100.",
        "Responses: 200, 400, 404, 429, 500.",
        "Success schema: ClientDetailResponse.",
      ],
    ],
    [
      "GET /api/v1/publishers/:slug",
      [
        "Parameter: slug; in path; required; maximum length 128; pattern ^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$.",
        "Parameter: cursor; in query; optional; minimum length 1; maximum length 2048.",
        "Parameter: limit; in query; optional; default 30; minimum 1; maximum 100.",
        "Responses: 200, 400, 404, 429, 500.",
        "Success schema: PublisherDetailResponse.",
      ],
    ],
    [
      "GET /api/v1/resolve/:identifier",
      [
        "Parameter: identifier; in path; required; maximum length 512.",
        "Responses: 200, 400, 404, 409, 429, 500.",
        "Success schema: ResolvedServerResponse.",
      ],
    ],
    [
      "GET /api/v1/resolve/:identifier/install",
      [
        "Parameter: identifier; in path; required; maximum length 512.",
        "Parameter: client; in query; optional; allowed claude-code, codex, cursor, vscode.",
        "Responses: 200, 400, 404, 409, 410, 429, 500.",
        "Success schema: InstallManifestResponse.",
      ],
    ],
    [
      "GET /api/v1/search",
      [
        "Parameter: q; in query; optional; minimum length 1; maximum length 200.",
        "Parameter: category; in query; optional; maximum length 128; pattern ^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$.",
        "Parameter: publisher; in query; optional; maximum length 128; pattern ^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$.",
        "Parameter: client; in query; optional; allowed claude-code, codex, cursor, vscode.",
        "Parameter: transport; in query; optional; minimum length 1; maximum length 64.",
        "Parameter: registryType; in query; optional; minimum length 1; maximum length 64.",
        "Parameter: verified; in query; optional; allowed true, false.",
        "Parameter: openSource; in query; optional; allowed true, false.",
        "Parameter: status; in query; optional; allowed active, deprecated, deleted_upstream, unavailable.",
        "Parameter: sort; in query; optional; default recent; allowed relevance, recent, updated, popular, name.",
        "Parameter: cursor; in query; optional; minimum length 1; maximum length 2048.",
        "Parameter: limit; in query; optional; default 30; minimum 1; maximum 100.",
        "Responses: 200, 400, 429, 500.",
        "Success schema: ServerCollectionResponse.",
      ],
    ],
    [
      "GET /api/v1/servers",
      [
        "Parameter: q; in query; optional; minimum length 1; maximum length 200.",
        "Parameter: category; in query; optional; maximum length 128; pattern ^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$.",
        "Parameter: publisher; in query; optional; maximum length 128; pattern ^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$.",
        "Parameter: client; in query; optional; allowed claude-code, codex, cursor, vscode.",
        "Parameter: transport; in query; optional; minimum length 1; maximum length 64.",
        "Parameter: registryType; in query; optional; minimum length 1; maximum length 64.",
        "Parameter: verified; in query; optional; allowed true, false.",
        "Parameter: openSource; in query; optional; allowed true, false.",
        "Parameter: status; in query; optional; allowed active, deprecated, deleted_upstream, unavailable.",
        "Parameter: sort; in query; optional; default recent; allowed relevance, recent, updated, popular, name.",
        "Parameter: cursor; in query; optional; minimum length 1; maximum length 2048.",
        "Parameter: limit; in query; optional; default 30; minimum 1; maximum 100.",
        "Responses: 200, 400, 429, 500.",
        "Success schema: ServerCollectionResponse.",
      ],
    ],
    [
      "GET /api/v1/servers/:slug",
      [
        "Parameter: slug; in path; required; maximum length 128; pattern ^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$.",
        "Responses: 200, 400, 404, 429, 500.",
        "Success schema: ServerDetailResponse.",
      ],
    ],
    [
      "GET /api/v1/servers/:slug/install",
      [
        "Parameter: slug; in path; required; maximum length 128; pattern ^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$.",
        "Parameter: client; in query; optional; allowed claude-code, codex, cursor, vscode.",
        "Responses: 200, 400, 404, 410, 429, 500.",
        "Success schema: InstallManifestResponse.",
      ],
    ],
  ] as const;

  for (const [heading, paragraphs] of expectedOperations) {
    await expect(page.getByRole("region", { name: heading, exact: true }).locator("p")).toHaveText(
      paragraphs,
    );
  }

  const examples = page.getByRole("region", { name: "Successful examples" });
  await expect(examples).toContainText("Collection - ServerCollectionResponse");
  await expect(examples).toContainText('"nextCursor": null');
  await expect(examples).toContainText("Resource - ResolvedServerResponse");
  await expect(examples).toContainText('"matchedBy": "slug"');
  await expect(examples).toContainText("Install - InstallManifestResponse");
  await expect(examples).toContainText('"schemaVersion": 1');
  await expect(page.getByRole("region", { name: "Listing statuses" }).locator("p")).toHaveText([
    "active",
    "deprecated",
    "deleted_upstream",
    "unavailable",
  ]);
  await expect(page.getByRole("region", { name: "Upstream deletion" }).locator("p")).toHaveText([
    "deleted_upstream listings return 410 UPSTREAM_DELETED for install requests.",
  ]);
});
