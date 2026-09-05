import type { Database } from "@themcpdirectory/db";
import {
  runPublisherRetentionSweep,
  type PublisherRetentionPolicy,
} from "@themcpdirectory/domain";

export const PUBLISHER_RETENTION_QUEUE = "publisher.retention";

export async function processPublisherRetentionJob(
  db: Database,
  checkedAt = new Date(),
  policyOverrides?: Partial<PublisherRetentionPolicy>,
): Promise<{
  expiredSessions: number;
  expiredClaims: number;
  cleanedAudits: number;
  cleanedOutboxRows: number;
  deletedDormantUsers: number;
}> {
  return runPublisherRetentionSweep(db, checkedAt, policyOverrides);
}
