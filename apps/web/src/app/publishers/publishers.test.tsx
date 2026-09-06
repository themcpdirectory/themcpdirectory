import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDatabase, publishers, servers, type Database } from "@themcpdirectory/db";
import { postgresAdminCandidates } from "@themcpdirectory/test-utils";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const db = { name: "test-db" };

const browseServers = vi.fn();
const getPublicPublishers = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@themcpdirectory/domain", () => ({
  browseServers: (...args: unknown[]) => browseServers(...args),
  getPublicPublishers: (...args: unknown[]) => getPublicPublishers(...args),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => db,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  notFound,
}));

interface PublicPublisherDirectoryEntry {
  readonly slug: string;
  readonly name: string;
  readonly verified: boolean;
  readonly websiteUrl: string | null;
  readonly serverCount: number;
}

interface DomainModule {
  readonly getPublicPublishers: (db: Database) => Promise<readonly PublicPublisherDirectoryEntry[]>;
}

interface TempDatabase {
  readonly databaseUrl: string;
  readonly databaseName: string;
  readonly db: Database;
  destroy(): Promise<void>;
}

async function chooseAdminConnectionString(): Promise<string> {
  const candidates = postgresAdminCandidates(
    process.env as Record<string, string | undefined>,
    "postgres://localhost:5432/postgres",
  );

  for (const candidate of candidates) {
    const sql = postgres(candidate, { max: 1 });
    try {
      await sql`select current_database()`;
      await sql.end();
      return candidate;
    } catch {
      await sql.end({ timeout: 0 });
    }
  }

  throw new Error("Unable to establish a local PostgreSQL admin connection for web tests.");
}

function buildDatabaseName(prefix: string): string {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${suffix}`;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function withDatabaseName(connectionString: string, databaseName: string): string {
  const parsed = new URL(connectionString);
  parsed.pathname = `/${databaseName}`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

async function runMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  const db = createDatabase(databaseUrl);
  const migrationsFolder = fileURLToPath(
    new URL("../../../../../packages/db/drizzle", import.meta.url),
  );

  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await client.end();
  }
}

async function createTempDatabase(prefix = "task6_public_publishers"): Promise<TempDatabase> {
  const adminConnectionString = await chooseAdminConnectionString();
  const admin = postgres(adminConnectionString, { max: 1 });
  const databaseName = buildDatabaseName(prefix);

  try {
    await admin.unsafe(`create database ${quoteIdentifier(databaseName)}`);
  } catch (err) {
    await admin.end({ timeout: 0 });
    throw err;
  }

  const databaseUrl = withDatabaseName(adminConnectionString, databaseName);
  await runMigrations(databaseUrl);

  const database = createDatabase(databaseUrl);

  return {
    databaseUrl,
    databaseName,
    db: database,
    async destroy() {
      const testClient = postgres(databaseUrl, { max: 1 });
      await testClient.end({ timeout: 0 });

      await admin`
        select pg_terminate_backend(pid)
        from pg_stat_activity
        where datname = ${databaseName}
          and pid <> pg_backend_pid()
      `;

      await admin.unsafe(`drop database if exists ${quoteIdentifier(databaseName)}`);
      await admin.end({ timeout: 0 });
    },
  };
}

let context: TempDatabase;

beforeAll(async () => {
  const observedAt = new Date("2026-09-06T10:00:00.000Z");
  context = await createTempDatabase();

  const [githubPublisher] = await context.db
    .insert(publishers)
    .values({
      slug: "github",
      displayName: "GitHub",
      verificationState: "verified",
      websiteUrl: "https://github.com",
    })
    .returning({ id: publishers.id });

  if (!githubPublisher) {
    throw new Error("expected GitHub publisher");
  }

  await context.db.insert(servers).values({
    slug: "github",
    title: "GitHub MCP",
    shortDescription: "GitHub automation",
    listingStatus: "active",
    moderationStatus: "normal",
    sourceAvailable: true,
    openSource: true,
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    publisherId: githubPublisher.id,
  });
}, 30_000);

afterAll(async () => {
  await context.destroy();
});

describe("publisher discovery routes", () => {
  beforeEach(() => {
    vi.resetModules();
    browseServers.mockReset();
    getPublicPublishers.mockReset();
    notFound.mockClear();
  });

  it("lists only verified publishers with active normal public servers in deterministic name and slug order", async () => {
    const observedAt = new Date("2026-09-06T12:00:00.000Z");
    const [alphaOne, alphaTwo, hiddenVerified, unverified, deletedVerified] = await context.db
      .insert(publishers)
      .values([
        {
          slug: "alpha-one",
          displayName: "Alpha",
          verificationState: "verified",
          websiteUrl: "https://alpha-one.example",
        },
        {
          slug: "alpha-two",
          displayName: "Alpha",
          verificationState: "verified",
          websiteUrl: "https://alpha-two.example",
        },
        {
          slug: "hidden-verified",
          displayName: "Hidden Verified",
          verificationState: "verified",
          websiteUrl: "https://hidden.example",
        },
        {
          slug: "unverified-public",
          displayName: "Unverified Public",
          verificationState: "unverified",
          websiteUrl: "https://unverified.example",
        },
        {
          slug: "deleted-verified",
          displayName: "Deleted Verified",
          verificationState: "verified",
          websiteUrl: "https://deleted.example",
        },
      ])
      .returning({ id: publishers.id });

    await context.db.insert(servers).values([
      {
        slug: "alpha-one-primary",
        title: "Alpha One Primary",
        shortDescription: "Alpha one primary tools",
        listingStatus: "active",
        moderationStatus: "normal",
        sourceAvailable: true,
        openSource: true,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        publisherId: alphaOne!.id,
      },
      {
        slug: "alpha-one-secondary",
        title: "Alpha One Secondary",
        shortDescription: "Alpha one secondary tools",
        listingStatus: "active",
        moderationStatus: "normal",
        sourceAvailable: true,
        openSource: true,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        publisherId: alphaOne!.id,
      },
      {
        slug: "alpha-one-hidden",
        title: "Alpha One Hidden",
        shortDescription: "Alpha one hidden tools",
        listingStatus: "active",
        moderationStatus: "hidden",
        sourceAvailable: true,
        openSource: true,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        publisherId: alphaOne!.id,
      },
      {
        slug: "alpha-two-primary",
        title: "Alpha Two Primary",
        shortDescription: "Alpha two primary tools",
        listingStatus: "active",
        moderationStatus: "normal",
        sourceAvailable: true,
        openSource: true,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        publisherId: alphaTwo!.id,
      },
      {
        slug: "hidden-verified-primary",
        title: "Hidden Verified Primary",
        shortDescription: "Hidden verified tools",
        listingStatus: "active",
        moderationStatus: "hidden",
        sourceAvailable: true,
        openSource: true,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        publisherId: hiddenVerified!.id,
      },
      {
        slug: "unverified-public-primary",
        title: "Unverified Public Primary",
        shortDescription: "Unverified public tools",
        listingStatus: "active",
        moderationStatus: "normal",
        sourceAvailable: true,
        openSource: true,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        publisherId: unverified!.id,
      },
      {
        slug: "deleted-verified-primary",
        title: "Deleted Verified Primary",
        shortDescription: "Deleted verified tools",
        listingStatus: "deleted_upstream",
        moderationStatus: "normal",
        sourceAvailable: true,
        openSource: true,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        publisherId: deletedVerified!.id,
      },
    ]);

    const domainModule = (await vi
      .importActual("@themcpdirectory/domain")
      .catch(() => null)) as DomainModule | null;

    expect(domainModule).not.toBeNull();
    if (!domainModule) return;

    expect(typeof domainModule.getPublicPublishers).toBe("function");
    if (typeof domainModule.getPublicPublishers !== "function") return;

    const results = await domainModule.getPublicPublishers(context.db);

    expect(results).toEqual([
      {
        slug: "alpha-one",
        name: "Alpha",
        verified: true,
        websiteUrl: "https://alpha-one.example",
        serverCount: 2,
      },
      {
        slug: "alpha-two",
        name: "Alpha",
        verified: true,
        websiteUrl: "https://alpha-two.example",
        serverCount: 1,
      },
      {
        slug: "github",
        name: "GitHub",
        verified: true,
        websiteUrl: "https://github.com",
        serverCount: 1,
      },
    ]);
  });

  it("renders the publishers index with factual publisher cards", async () => {
    getPublicPublishers.mockResolvedValue([
      {
        slug: "github",
        name: "GitHub",
        verified: true,
        websiteUrl: "https://github.com",
        serverCount: 3,
      },
    ]);

    const pageModule = await import("./page").catch(() => null);

    expect(pageModule).not.toBeNull();
    if (!pageModule) return;

    const markup = renderToStaticMarkup(await pageModule.default());

    expect(getPublicPublishers).toHaveBeenCalledWith(db);
    expect(markup).toContain("Publishers");
    expect(markup).toContain("Verified publisher");
    expect(markup).toContain("github.com");
    expect(markup).toContain("3 servers");
    expect(markup).toContain("/publishers/github");
  });

  it("renders publisher detail with shared server cards and a browse link", async () => {
    getPublicPublishers.mockResolvedValue([
      {
        slug: "github",
        name: "GitHub",
        verified: true,
        websiteUrl: "https://github.com",
        serverCount: 1,
      },
    ]);
    browseServers.mockResolvedValue({
      items: [
        {
          id: "server-1",
          slug: "github",
          title: "GitHub MCP",
          shortDescription: "GitHub automation",
          publisher: { slug: "github", name: "GitHub", verified: true },
          officialRegistry: true,
          sourceAvailable: true,
          openSource: true,
          supportedClients: ["cursor"],
          transports: ["streamable-http"],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 24,
      totalPages: 1,
    });

    const pageModule = await import("./[slug]/page").catch(() => null);

    expect(pageModule).not.toBeNull();
    if (!pageModule) return;

    const markup = renderToStaticMarkup(
      await pageModule.default({ params: Promise.resolve({ slug: "github" }) }),
    );

    expect(getPublicPublishers).toHaveBeenCalledWith(db);
    expect(browseServers).toHaveBeenCalledWith(db, {
      page: 1,
      pageSize: 24,
      publisher: "github",
      sort: "recent",
    });
    expect(markup).toContain("GitHub");
    expect(markup).toContain("https://github.com");
    expect(markup).toContain("GitHub MCP");
    expect(markup).toContain("/browse?publisher=github");
  });

  it("404s publisher detail when the slug is not public", async () => {
    getPublicPublishers.mockResolvedValue([]);

    const pageModule = await import("./[slug]/page").catch(() => null);

    expect(pageModule).not.toBeNull();
    if (!pageModule) return;

    await expect(
      pageModule.default({ params: Promise.resolve({ slug: "unknown" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(browseServers).not.toHaveBeenCalled();
  });
});
