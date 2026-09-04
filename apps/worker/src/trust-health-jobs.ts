import type { Database } from "@themcpdirectory/db";
import type {
  PersistedRemoteHealthObservation,
  RefreshTrustProfileInput,
  RunRemoteHealthCheckInput,
} from "@themcpdirectory/domain";
import { REMOTE_PROBE_POLICY, type PerOriginProbeLimiter } from "./trust-health-config.js";

export const REMOTE_HEALTH_QUEUE = "remote.health";
export const TRUST_REFRESH_QUEUE = "trust.refresh";
export const HEALTH_RETENTION_QUEUE = "health.retention";
export const TRUST_RETENTION_QUEUE = "trust.retention";
export const TRUST_HEALTH_SWEEP_JOB = Object.freeze({ kind: "sweep" as const });

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TrustHealthJobDataError extends Error {
  constructor(queue: string) {
    super(`Invalid job data for queue '${queue}'.`);
    this.name = "TrustHealthJobDataError";
  }
}

export interface RemoteHealthJob {
  readonly serverId: string;
  readonly remoteId: string;
  readonly retriesConsumed?: number;
  readonly retryChainId?: string;
}

export interface RemoteHealthExecutionJob extends RemoteHealthJob {
  readonly url: string;
}

export interface TrustRefreshJob {
  readonly serverId: string;
}

export interface RemoteHealthJobDependencies {
  readonly db: Database;
  readonly clock: () => Date;
  readonly resolve: RunRemoteHealthCheckInput["resolve"];
  readonly originProbeLimiter: PerOriginProbeLimiter;
  readonly runRemoteHealthCheck: (
    db: Database,
    input: RunRemoteHealthCheckInput,
  ) => Promise<PersistedRemoteHealthObservation>;
}

export interface TrustRefreshResult {
  readonly signals: readonly unknown[];
}

export interface TrustRefreshJobDependencies {
  readonly db: Database;
  readonly clock: () => Date;
  readonly refreshTrustProfile: (
    db: Database,
    input: RefreshTrustProfileInput,
  ) => Promise<TrustRefreshResult>;
}

export function isTrustHealthSweepJob(data: unknown): data is typeof TRUST_HEALTH_SWEEP_JOB {
  return (
    !!data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Object.keys(data).length === 1 &&
    (data as Record<string, unknown>).kind === "sweep"
  );
}

export function parseRemoteHealthJob(data: unknown): RemoteHealthJob {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TrustHealthJobDataError(REMOTE_HEALTH_QUEUE);
  }
  const candidate = data as Record<string, unknown>;
  const retriesConsumed = candidate.retriesConsumed;
  const retryChainId = candidate.retryChainId;
  if (
    !UUID_PATTERN.test(String(candidate.serverId)) ||
    !UUID_PATTERN.test(String(candidate.remoteId)) ||
    (retriesConsumed !== undefined &&
      (typeof retriesConsumed !== "number" ||
        !Number.isInteger(retriesConsumed) ||
        retriesConsumed < 0 ||
        retriesConsumed > 5)) ||
    (retryChainId !== undefined && !UUID_PATTERN.test(String(retryChainId))) ||
    !Object.keys(candidate).every((key) =>
      ["serverId", "remoteId", "retriesConsumed", "retryChainId"].includes(key),
    )
  ) {
    throw new TrustHealthJobDataError(REMOTE_HEALTH_QUEUE);
  }

  return {
    serverId: candidate.serverId as string,
    remoteId: candidate.remoteId as string,
    ...(typeof retriesConsumed === "number" ? { retriesConsumed } : {}),
    ...(typeof retryChainId === "string" ? { retryChainId } : {}),
  };
}

export function remoteHealthRetrySingletonKey(
  remoteId: string,
  retryChainId: string,
  retriesConsumed: number,
): string {
  return `${remoteId}:retry:${retryChainId}:${retriesConsumed}`;
}

export function parseTrustRefreshJob(data: unknown): TrustRefreshJob {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TrustHealthJobDataError(TRUST_REFRESH_QUEUE);
  }
  const candidate = data as Record<string, unknown>;
  if (!UUID_PATTERN.test(String(candidate.serverId)) || Object.keys(candidate).length !== 1) {
    throw new TrustHealthJobDataError(TRUST_REFRESH_QUEUE);
  }
  return { serverId: candidate.serverId as string };
}

export async function runRemoteHealthJob(
  dependencies: RemoteHealthJobDependencies,
  job: RemoteHealthExecutionJob,
): Promise<PersistedRemoteHealthObservation> {
  return dependencies.runRemoteHealthCheck(dependencies.db, {
    serverId: job.serverId,
    remoteId: job.remoteId,
    expectedUrl: job.url,
    checkedAt: dependencies.clock(),
    resolve: dependencies.resolve,
    withOriginLimit: (origin, request) => dependencies.originProbeLimiter.withKey(origin, request),
    probeOptions: REMOTE_PROBE_POLICY,
  });
}

export function runTrustRefreshJob(
  dependencies: TrustRefreshJobDependencies,
  job: TrustRefreshJob,
): Promise<TrustRefreshResult> {
  return dependencies.refreshTrustProfile(dependencies.db, {
    serverId: job.serverId,
    observedAt: dependencies.clock(),
  });
}
