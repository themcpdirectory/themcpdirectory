import { RegistryPageSchema, type RegistryPage } from "@themcpdirectory/registry-client";

interface PublisherSeed {
  readonly slug: string;
  readonly displayName: string;
  readonly description: string;
  readonly websiteUrl: string;
  readonly githubOrg: string;
  readonly verificationState: "verified" | "unverified";
}

interface PublisherLinkSeed {
  readonly serverSlug: string;
  readonly publisherSlug: string;
}

interface AliasSeed {
  readonly alias: string;
  readonly kind: "manual";
  readonly serverSlug: string;
}

interface ServerCategorySeed {
  readonly serverSlug: string;
  readonly categorySlug: string;
  readonly source: "manual" | "import";
}

interface ManagedImportCategoryAssignmentKey {
  readonly serverSlug: string;
  readonly categorySlug: string;
}

export interface SeedFixtureBundle {
  readonly source: {
    key: string;
    name: string;
    baseUrl: string;
    kind: string;
    enabled: boolean;
  };
  readonly observedAt: Date;
  readonly pages: readonly RegistryPage[];
  readonly publishers: readonly PublisherSeed[];
  readonly publisherLinks: readonly PublisherLinkSeed[];
  readonly aliases: readonly AliasSeed[];
  readonly managedAliasValues: readonly string[];
  readonly categoryAssignments: readonly ServerCategorySeed[];
  readonly managedImportCategoryAssignmentKeys: readonly ManagedImportCategoryAssignmentKey[];
}

const pageOne = RegistryPageSchema.parse({
  servers: [
    {
      server: {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "io.github.official/github",
        title: "GitHub MCP",
        description: "Repository, issue, and pull-request workflows from GitHub for local assistants.",
        version: "2.3.0",
        repository: {
          url: "https://github.com/themcpdirectory/github-mcp",
          source: "github",
          id: "themcpdirectory/github-mcp",
        },
        websiteUrl: "https://github.com/themcpdirectory/github-mcp",
        packages: [
          {
            registryType: "npm",
            registryBaseUrl: "https://registry.npmjs.org",
            identifier: "@themcpdirectory/github-mcp",
            version: "2.3.0",
            runtimeHint: "npx",
            transport: { type: "stdio" },
            environmentVariables: [
              {
                name: "GITHUB_TOKEN",
                description: "Personal access token with repository read permissions.",
                isRequired: true,
                isSecret: true,
              },
            ],
          },
        ],
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "active",
          statusChangedAt: "2026-02-01T00:00:00.000Z",
          publishedAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-08-20T10:00:00.000Z",
          isLatest: true,
        },
      },
    },
    {
      server: {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "io.playwright.community/playwright",
        title: "Playwright Browser Agent",
        description: "Remote browser automation for testing and scripted user journeys.",
        version: "1.1.0",
        repository: {
          url: "https://github.com/themcpdirectory/playwright-agent",
          source: "github",
          id: "themcpdirectory/playwright-agent",
        },
        websiteUrl: "https://playwright.dev",
        remotes: [
          {
            type: "streamable-http",
            url: "https://mcp.playwright.dev/{tenant}/api",
            variables: {
              tenant: {
                description: "Tenant identifier for multi-project routing.",
                isRequired: true,
                format: "string",
              },
            },
            headers: [
              {
                name: "Authorization",
                description: "Bearer token for remote execution.",
                isRequired: false,
                value: "Bearer {token}",
              },
            ],
          },
        ],
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "active",
          statusChangedAt: "2026-03-10T00:00:00.000Z",
          publishedAt: "2026-03-10T00:00:00.000Z",
          updatedAt: "2026-08-15T10:00:00.000Z",
          isLatest: true,
        },
      },
    },
    {
      server: {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "io.database.tools/postgresql",
        title: "PostgreSQL Toolkit",
        description: "Local and remote PostgreSQL operations for schemas, migrations, and diagnostics.",
        version: "1.4.0",
        repository: {
          url: "https://github.com/themcpdirectory/postgresql-toolkit",
          source: "github",
          id: "themcpdirectory/postgresql-toolkit",
        },
        websiteUrl: "https://example.dev/postgresql-toolkit",
        packages: [
          {
            registryType: "npm",
            registryBaseUrl: "https://registry.npmjs.org",
            identifier: "@themcpdirectory/postgresql-mcp",
            version: "1.4.0",
            runtimeHint: "npx",
            transport: { type: "stdio" },
          },
        ],
        remotes: [
          {
            type: "streamable-http",
            url: "https://mcp.db.example.com/{projectRef}",
            variables: {
              projectRef: {
                description: "Database project reference.",
                isRequired: true,
                format: "string",
              },
            },
          },
        ],
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "active",
          statusChangedAt: "2026-01-05T00:00:00.000Z",
          publishedAt: "2026-01-05T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          isLatest: false,
        },
      },
    },
    {
      server: {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "io.legacy.ops/legacy-monitor",
        title: "Legacy Monitor",
        description: "Historical monitoring connector retained for compatibility migrations.",
        version: "0.9.2",
        packages: [
          {
            registryType: "npm",
            registryBaseUrl: "https://registry.npmjs.org",
            identifier: "@community/legacy-monitor-mcp",
            version: "0.9.2",
            transport: { type: "stdio" },
          },
        ],
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "deprecated",
          statusChangedAt: "2026-07-01T00:00:00.000Z",
          statusMessage: "Use modern observability integrations.",
          publishedAt: "2025-10-10T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
          isLatest: true,
        },
      },
    },
  ],
  metadata: {
    count: 4,
    nextCursor: "page-2",
  },
});

const pageTwo = RegistryPageSchema.parse({
  servers: [
    {
      server: {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "io.database.tools/postgresql",
        title: "PostgreSQL Toolkit",
        description: "Local and remote PostgreSQL operations for schemas, migrations, and diagnostics.",
        version: "1.5.0",
        repository: {
          url: "https://github.com/themcpdirectory/postgresql-toolkit",
          source: "github",
          id: "themcpdirectory/postgresql-toolkit",
        },
        websiteUrl: "https://example.dev/postgresql-toolkit",
        packages: [
          {
            registryType: "npm",
            registryBaseUrl: "https://registry.npmjs.org",
            identifier: "@themcpdirectory/postgresql-mcp",
            version: "1.5.0",
            runtimeHint: "npx",
            transport: { type: "stdio" },
            environmentVariables: [
              {
                name: "DATABASE_URL",
                description: "Connection string for target PostgreSQL instance.",
                isRequired: true,
                format: "string",
              },
            ],
          },
        ],
        remotes: [
          {
            type: "streamable-http",
            url: "https://mcp.db.example.com/{projectRef}",
            variables: {
              projectRef: {
                description: "Database project reference.",
                isRequired: true,
                format: "string",
              },
            },
          },
        ],
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "active",
          statusChangedAt: "2026-08-25T00:00:00.000Z",
          publishedAt: "2026-08-25T00:00:00.000Z",
          updatedAt: "2026-08-25T00:00:00.000Z",
          isLatest: true,
        },
      },
    },
    {
      server: {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "io.retired.tools/retired-notifier",
        title: "Retired Notifier",
        description: "Notification endpoint retired upstream and kept only for historical reference.",
        version: "0.3.1",
        remotes: [
          {
            type: "streamable-http",
            url: "https://retired.example.com/mcp",
          },
        ],
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "deleted",
          statusChangedAt: "2026-05-10T00:00:00.000Z",
          statusMessage: "Removed by publisher.",
          publishedAt: "2025-09-01T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
          isLatest: true,
        },
      },
    },
    {
      server: {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "io.example.catalog/shared-handle",
        title: "Shared Handle Catalog",
        description: "Catalog server used to exercise slug and alias resolution paths.",
        version: "1.0.0",
        packages: [
          {
            registryType: "npm",
            registryBaseUrl: "https://registry.npmjs.org",
            identifier: "@community/shared-handle",
            version: "1.0.0",
            transport: { type: "stdio" },
          },
        ],
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "active",
          statusChangedAt: "2026-04-12T00:00:00.000Z",
          publishedAt: "2026-04-12T00:00:00.000Z",
          updatedAt: "2026-04-12T00:00:00.000Z",
          isLatest: true,
        },
      },
    },
    {
      server: {
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        name: "io.database.tools/supabase",
        title: "Supabase Data Operator",
        description: "Database project operations, migrations, and audit helpers for managed Postgres.",
        version: "1.2.0",
        repository: {
          url: "https://github.com/themcpdirectory/supabase-operator",
          source: "github",
          id: "themcpdirectory/supabase-operator",
        },
        packages: [
          {
            registryType: "npm",
            registryBaseUrl: "https://registry.npmjs.org",
            identifier: "@themcpdirectory/supabase-operator-mcp",
            version: "1.2.0",
            runtimeHint: "npx",
            transport: { type: "stdio" },
            environmentVariables: [
              {
                name: "SUPABASE_ACCESS_TOKEN",
                description: "Access token for project API operations.",
                isRequired: true,
                isSecret: true,
              },
            ],
          },
        ],
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "active",
          statusChangedAt: "2026-06-09T00:00:00.000Z",
          publishedAt: "2026-06-09T00:00:00.000Z",
          updatedAt: "2026-08-09T00:00:00.000Z",
          isLatest: true,
        },
      },
    },
  ],
  metadata: {
    count: 4,
  },
});

export const SEED_FIXTURES: SeedFixtureBundle = {
  source: {
    key: "official",
    name: "Official MCP Registry",
    baseUrl: "https://registry.modelcontextprotocol.io",
    kind: "official",
    enabled: true,
  },
  observedAt: new Date("2026-09-01T00:00:00.000Z"),
  pages: [pageOne, pageTwo],
  publishers: [
    {
      slug: "github",
      displayName: "GitHub",
      description: "Source hosting and collaboration platform.",
      websiteUrl: "https://github.com",
      githubOrg: "github",
      verificationState: "verified",
    },
    {
      slug: "community-labs",
      displayName: "Community Labs",
      description: "Independent maintainers publishing practical MCP integrations.",
      websiteUrl: "https://community.example.dev",
      githubOrg: "community-labs",
      verificationState: "unverified",
    },
  ],
  publisherLinks: [
    { serverSlug: "github", publisherSlug: "github" },
    { serverSlug: "playwright", publisherSlug: "community-labs" },
    { serverSlug: "postgresql", publisherSlug: "community-labs" },
    { serverSlug: "legacy-monitor", publisherSlug: "community-labs" },
    { serverSlug: "retired-notifier", publisherSlug: "community-labs" },
    { serverSlug: "shared-handle", publisherSlug: "community-labs" },
    { serverSlug: "supabase", publisherSlug: "community-labs" },
  ],
  aliases: [
    { alias: "github-server", kind: "manual", serverSlug: "github" },
    { alias: "postgres", kind: "manual", serverSlug: "postgresql" },
    { alias: "shared-handle", kind: "manual", serverSlug: "supabase" },
  ],
  managedAliasValues: ["github-server", "postgres", "shared-handle"],
  categoryAssignments: [
    { serverSlug: "github", categorySlug: "developer-tools", source: "import" },
    { serverSlug: "github", categorySlug: "project-management", source: "import" },
    { serverSlug: "github", categorySlug: "communication", source: "import" },
    { serverSlug: "playwright", categorySlug: "browser-automation", source: "import" },
    { serverSlug: "playwright", categorySlug: "developer-tools", source: "import" },
    { serverSlug: "postgresql", categorySlug: "databases", source: "import" },
    { serverSlug: "postgresql", categorySlug: "infrastructure", source: "import" },
    { serverSlug: "supabase", categorySlug: "databases", source: "import" },
    { serverSlug: "supabase", categorySlug: "cloud", source: "import" },
    { serverSlug: "legacy-monitor", categorySlug: "monitoring", source: "import" },
    { serverSlug: "retired-notifier", categorySlug: "communication", source: "import" },
    { serverSlug: "shared-handle", categorySlug: "search", source: "import" },
  ],
  managedImportCategoryAssignmentKeys: [
    { serverSlug: "github", categorySlug: "developer-tools" },
    { serverSlug: "github", categorySlug: "project-management" },
    { serverSlug: "github", categorySlug: "communication" },
    { serverSlug: "playwright", categorySlug: "browser-automation" },
    { serverSlug: "playwright", categorySlug: "developer-tools" },
    { serverSlug: "postgresql", categorySlug: "databases" },
    { serverSlug: "postgresql", categorySlug: "infrastructure" },
    { serverSlug: "supabase", categorySlug: "databases" },
    { serverSlug: "supabase", categorySlug: "cloud" },
    { serverSlug: "legacy-monitor", categorySlug: "monitoring" },
    { serverSlug: "retired-notifier", categorySlug: "communication" },
    { serverSlug: "shared-handle", categorySlug: "search" },
  ],
};
