import { eq, sql } from "drizzle-orm";
import type { CliTelemetryEventV1 } from "@themcpdirectory/api-contract";
import { cliTelemetryEvents, servers, type Database } from "@themcpdirectory/db";

export class TelemetryServerNotFoundError extends Error {
  constructor() {
    super("Telemetry server slug is not canonical");
    this.name = "TelemetryServerNotFoundError";
  }
}

export async function recordCliTelemetryEvent(
  db: Pick<Database, "select" | "insert">,
  event: CliTelemetryEventV1,
): Promise<void> {
  let serverId: string | null = null;
  if (event.slug !== undefined) {
    const [server] = await db
      .select({ id: servers.id, slug: sql<string>`${servers.slug}::text` })
      .from(servers)
      .where(eq(servers.slug, event.slug))
      .limit(1);
    if (!server || server.slug !== event.slug) throw new TelemetryServerNotFoundError();
    serverId = server.id;
  }

  const [major, minor] = event.cliVersion.split(".");
  await db.insert(cliTelemetryEvents).values({
    event: event.event,
    serverId,
    cliMajorMinor: `${major}.${minor}`,
    client: event.client ?? null,
    success: event.success,
    installVariant: event.installVariant ?? null,
  });
}
