/**
 * Validated fixture for the Official MCP Registry `/v0.1/servers` response.
 *
 * Source: https://github.com/modelcontextprotocol/registry
 *   - pkg/api/v0/types.go (ServerListResponse, ServerResponse, Metadata, ServerJSON, ServerMeta)
 *   - pkg/model/types.go (Transport, Package, Repository, Icon, etc.)
 *   - pkg/model/constants.go (schema version 2025-12-11)
 *   - docs/reference/api/openapi.yaml (API spec version 2025-12-01)
 *   - docs/reference/api/generic-registry-api.md (response examples)
 *
 * Commit: 6036804f1c62633b5e7d2927f411a6f4127f148a
 * Retrieved: 2026-09-01
 *
 * This fixture is a hand-constructed minimal valid response, NOT a copy of
 * upstream copyrighted content. It exercises: two servers, nextCursor,
 * packages/remotes/repository/icons/meta fields, and the _meta envelope.
 */

export const VALID_REGISTRY_PAGE = {
  servers: [
    {
      server: {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "io.github.example/test-server",
        description: "A test MCP server for unit testing",
        title: "Test Server",
        version: "1.2.0",
        repository: {
          url: "https://github.com/example/test-server",
          source: "github",
          id: "abc123",
        },
        websiteUrl: "https://example.com/test-server",
        icons: [
          {
            src: "https://example.com/icon-48.png",
            sizes: ["48x48"],
            mimeType: "image/png",
          },
        ],
        packages: [
          {
            registryType: "npm",
            registryBaseUrl: "https://registry.npmjs.org",
            identifier: "@example/test-server",
            version: "1.2.0",
            runtimeHint: "npx",
            transport: { type: "stdio" },
            environmentVariables: [
              {
                name: "TEST_API_KEY",
                description: "API key",
                isRequired: true,
                isSecret: true,
              },
            ],
          },
        ],
        remotes: [
          {
            type: "streamable-http",
            url: "https://mcp.example.com/http",
          },
        ],
        _meta: {
          "io.modelcontextprotocol.registry/publisher-provided": {
            tool: "test-publisher",
            version: "1.0.0",
          },
        },
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "active",
          statusChangedAt: "2025-06-01T12:00:00Z",
          publishedAt: "2025-06-01T12:00:00Z",
          updatedAt: "2025-07-15T08:30:00Z",
          isLatest: true,
        },
      },
    },
    {
      server: {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "io.github.example/minimal-server",
        description: "Minimal MCP server",
        version: "0.1.0",
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "deprecated",
          statusChangedAt: "2025-08-01T00:00:00Z",
          statusMessage: "Use test-server instead",
          publishedAt: "2025-03-01T00:00:00Z",
          updatedAt: "2025-08-01T00:00:00Z",
          isLatest: false,
        },
      },
    },
  ],
  metadata: {
    nextCursor: "io.github.example/minimal-server:0.1.0",
    count: 2,
  },
} as const;

export const VALID_EMPTY_PAGE = {
  servers: [],
  metadata: {
    count: 0,
  },
} as const;

export const VALID_LAST_PAGE = {
  servers: [
    {
      server: {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "io.github.example/last-server",
        description: "Last server in results",
        version: "1.0.0",
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "active",
          statusChangedAt: "2025-09-01T00:00:00Z",
          publishedAt: "2025-09-01T00:00:00Z",
          updatedAt: "2025-09-01T00:00:00Z",
          isLatest: true,
        },
      },
    },
  ],
  metadata: {
    count: 1,
  },
} as const;

export const VALID_PAGE_WITHOUT_META = {
  servers: [
    {
      server: {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "io.github.example/no-meta-server",
        description: "Server response without _meta envelope",
        version: "1.0.0",
      },
    },
  ],
  metadata: {
    count: 1,
  },
} as const;
