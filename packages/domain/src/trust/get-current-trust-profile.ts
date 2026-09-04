import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { TrustProfileV1Schema, type TrustProfileV1 } from "@themcpdirectory/api-contract";
import { trustSignals, type Database } from "@themcpdirectory/db";
import { TRUST_SIGNAL_ORDER } from "./refresh-trust-profile.js";

export async function getCurrentTrustProfile(
  db: Database,
  serverId: string,
): Promise<TrustProfileV1 | null> {
  const rows = await db
    .selectDistinctOn([trustSignals.signalKey], {
      id: trustSignals.id,
      key: trustSignals.signalKey,
      state: trustSignals.status,
      label: trustSignals.summary,
      observedAt: trustSignals.checkedAt,
      source: trustSignals.source,
      reason: trustSignals.details,
    })
    .from(trustSignals)
    .where(
      and(
        eq(trustSignals.serverId, serverId),
        inArray(trustSignals.signalKey, TRUST_SIGNAL_ORDER),
        isNotNull(trustSignals.checkedAt),
        isNotNull(trustSignals.source),
        isNotNull(trustSignals.summary),
      ),
    )
    .orderBy(
      asc(trustSignals.signalKey),
      desc(trustSignals.checkedAt),
      desc(trustSignals.updatedAt),
      desc(trustSignals.id),
    );

  if (rows.length === 0) return null;
  const profile = TrustProfileV1Schema.parse({
    schemaVersion: 1,
    signals: rows.map((row) => ({
      key: row.key,
      state: row.state,
      label: row.label,
      observedAt: row.observedAt?.toISOString(),
      source: row.source,
      reason: row.reason,
    })),
  });
  return {
    ...profile,
    signals: profile.signals.toSorted(
      (left, right) => TRUST_SIGNAL_ORDER.indexOf(left.key) - TRUST_SIGNAL_ORDER.indexOf(right.key),
    ),
  };
}
