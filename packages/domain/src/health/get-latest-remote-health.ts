import { and, desc, eq } from "drizzle-orm";
import {
  RemoteHealthObservationV1Schema,
  type RemoteHealthObservationV1,
} from "@themcpdirectory/api-contract";
import { serverHealthChecks, type Database } from "@themcpdirectory/db";

export async function getLatestRemoteHealthObservation(
  db: Database,
  serverId: string,
): Promise<RemoteHealthObservationV1 | null> {
  const [row] = await db
    .select({
      id: serverHealthChecks.id,
      status: serverHealthChecks.status,
      checkedAt: serverHealthChecks.checkedAt,
      latencyMs: serverHealthChecks.latencyMs,
      httpStatus: serverHealthChecks.httpStatus,
      finalOrigin: serverHealthChecks.finalOrigin,
      redirectCount: serverHealthChecks.redirectCount,
    })
    .from(serverHealthChecks)
    .where(
      and(
        eq(serverHealthChecks.serverId, serverId),
        eq(serverHealthChecks.checkType, "remote_probe"),
      ),
    )
    .orderBy(
      desc(serverHealthChecks.checkedAt),
      desc(serverHealthChecks.createdAt),
      desc(serverHealthChecks.id),
    )
    .limit(1);

  if (!row) return null;
  return RemoteHealthObservationV1Schema.parse({
    schemaVersion: 1,
    outcome: row.status,
    checkedAt: row.checkedAt.toISOString(),
    durationMs: row.latencyMs ?? 0,
    httpStatus: row.httpStatus,
    finalOrigin: row.finalOrigin,
    redirectCount: row.redirectCount,
  });
}
