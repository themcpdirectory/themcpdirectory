import type { Database } from "@themcpdirectory/db";
import { deliverTrustRefreshOutbox } from "@themcpdirectory/domain";

export const PUBLISHER_OUTBOX_QUEUE = "publisher.outbox";

export async function processPublisherOutboxJob(
  db: Database,
  checkedAt = new Date(),
): Promise<{ delivered: number; retried: number }> {
  return deliverTrustRefreshOutbox(db, checkedAt);
}
