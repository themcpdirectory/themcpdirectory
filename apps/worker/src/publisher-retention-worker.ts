import type { Database } from "@themcpdirectory/db";
import {
  runPublisherRetentionSweep,
  type PublisherRetentionPolicy,
} from "@themcpdirectory/domain";

export const PUBLISHER_RETENTION_QUEUE = "publisher.retention";

export type PublisherRetentionMode = "daily" | "monthly_with_dormant";

export interface PublisherRetentionJobData {
  readonly mode: PublisherRetentionMode;
}

export class PublisherRetentionJobDataError extends Error {
  constructor() {
    super("Publisher retention job data must be an object with mode=daily|monthly_with_dormant.");
    this.name = "PublisherRetentionJobDataError";
  }
}

export function parsePublisherRetentionJobData(
  data: unknown,
  checkedAt: Date,
): PublisherRetentionJobData {
  if (data === undefined || data === null) {
    return { mode: checkedAt.getUTCDate() === 1 ? "monthly_with_dormant" : "daily" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new PublisherRetentionJobDataError();
  }

  const candidate = data as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const validKeys = keys.length === 1 && keys[0] === "mode";
  const mode = candidate.mode;
  if (!validKeys || (mode !== "daily" && mode !== "monthly_with_dormant")) {
    throw new PublisherRetentionJobDataError();
  }

  return { mode };
}

export async function processPublisherRetentionJob(
  db: Database,
  checkedAt = new Date(),
  policyOverrides?: Partial<PublisherRetentionPolicy>,
  jobData?: PublisherRetentionJobData,
): Promise<{
  expiredSessions: number;
  expiredClaims: number;
  cleanedAudits: number;
  cleanedOutboxRows: number;
  deletedDormantUsers: number;
  done: boolean;
}> {
  const mode = jobData?.mode ?? (checkedAt.getUTCDate() === 1 ? "monthly_with_dormant" : "daily");
  return runPublisherRetentionSweep(db, checkedAt, policyOverrides, {
    includeDormantUsers: mode === "monthly_with_dormant",
  });
}
