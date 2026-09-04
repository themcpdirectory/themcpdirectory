import { and, eq, sql } from "drizzle-orm";
import type { HealthCheckOutcome, RemoteHealthObservationV1 } from "@themcpdirectory/api-contract";
import {
  serverHealthChecks,
  serverRemotes,
  serverVersions,
  servers,
  type Database,
} from "@themcpdirectory/db";
import {
  performPinnedProbe,
  type DnsResolver,
  type PinnedProbeRequestOptions,
  type PinnedProbeResponse,
  type ProbeFetch,
} from "@themcpdirectory/security";
import { decideRemoteProbeEligibility } from "./remote-probe-eligibility.js";

const FALLBACK_TO_GET_STATUSES = new Set([400, 405, 406, 501]);

class HealthCheckDeadlineError extends Error {
  constructor() {
    super("Remote health check exceeded its total duration.");
    this.name = "HealthCheckDeadlineError";
  }
}

function durationSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function remainingTimeoutMs(deadlineAt: number): number | null {
  const remainingMs = deadlineAt - Date.now();
  return remainingMs > 0 ? remainingMs : null;
}

function totalTimeoutResult(startedAt: number, methodUsed: "HEAD" | "GET" | null): HealthResult {
  return {
    outcome: "timed_out",
    methodUsed,
    finalOrigin: null,
    httpStatus: null,
    redirectCount: 0,
    durationMs: durationSince(startedAt),
    errorCode: "total_timeout",
    errorSummary: "probe timed out",
  };
}

async function withDeadline<T>(promise: Promise<T>, deadlineAt: number): Promise<T> {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw new HealthCheckDeadlineError();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new HealthCheckDeadlineError()), remainingMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export type RemoteHealthProbeOptions = Omit<
  PinnedProbeRequestOptions,
  "fetchImpl" | "method" | "resolve"
>;

export interface ForbiddenStdioSideEffects {
  readonly resolvePackage: () => unknown;
  readonly importPackage: () => unknown;
  readonly inspectPackage: () => unknown;
  readonly installPackage: () => unknown;
  readonly executeProcess: () => unknown;
}

export interface RunRemoteHealthCheckInput {
  readonly serverId: string;
  readonly remoteId: string;
  readonly checkedAt: Date;
  readonly resolve: DnsResolver;
  readonly fetchImpl?: ProbeFetch;
  readonly probeOptions: RemoteHealthProbeOptions;
  readonly forbiddenStdioSideEffects?: ForbiddenStdioSideEffects;
}

export interface PersistedRemoteHealthObservation extends RemoteHealthObservationV1 {
  readonly methodUsed: "HEAD" | "GET" | null;
  readonly errorCode: string | null;
  readonly errorSummary: string | null;
}

interface HealthCheckTarget {
  readonly serverVersionId: string;
  readonly listingStatus: string;
  readonly transportType: string;
  readonly urlTemplate: string;
  readonly headers: unknown;
  readonly variables: unknown;
}

interface HealthResult {
  readonly outcome: HealthCheckOutcome;
  readonly methodUsed: "HEAD" | "GET" | null;
  readonly finalOrigin: string | null;
  readonly httpStatus: number | null;
  readonly redirectCount: number;
  readonly durationMs: number;
  readonly errorCode: string | null;
  readonly errorSummary: string | null;
}

async function loadHealthCheckTarget(
  db: Database,
  serverId: string,
  remoteId: string,
): Promise<HealthCheckTarget> {
  const [target] = await db
    .select({
      serverVersionId: serverRemotes.serverVersionId,
      listingStatus: servers.listingStatus,
      transportType: serverRemotes.transportType,
      urlTemplate: serverRemotes.urlTemplate,
      headers: serverRemotes.headers,
      variables: serverRemotes.variables,
    })
    .from(serverRemotes)
    .innerJoin(serverVersions, eq(serverVersions.id, serverRemotes.serverVersionId))
    .innerJoin(servers, eq(servers.id, serverVersions.serverId))
    .where(and(eq(serverRemotes.id, remoteId), eq(servers.id, serverId)))
    .limit(1);

  if (!target) throw new Error("Remote health-check target was not found.");
  return target;
}

async function persistHealthObservation(
  db: Database,
  input: RunRemoteHealthCheckInput,
  serverVersionId: string,
  result: HealthResult,
): Promise<PersistedRemoteHealthObservation> {
  await db
    .insert(serverHealthChecks)
    .values({
      serverId: input.serverId,
      serverVersionId,
      remoteId: input.remoteId,
      checkType: "remote_probe",
      status: result.outcome,
      latencyMs: result.durationMs,
      httpStatus: result.httpStatus,
      errorCode: result.errorCode,
      errorSummary: result.errorSummary,
      finalOrigin: result.finalOrigin,
      redirectCount: result.redirectCount,
      methodUsed: result.methodUsed,
      checkedAt: input.checkedAt,
    })
    .onConflictDoUpdate({
      target: [serverHealthChecks.remoteId, serverHealthChecks.checkedAt],
      targetWhere: sql`${serverHealthChecks.remoteId} is not null`,
      set: {
        serverId: input.serverId,
        serverVersionId,
        checkType: "remote_probe",
        status: result.outcome,
        latencyMs: result.durationMs,
        httpStatus: result.httpStatus,
        errorCode: result.errorCode,
        errorSummary: result.errorSummary,
        finalOrigin: result.finalOrigin,
        redirectCount: result.redirectCount,
        methodUsed: result.methodUsed,
      },
    });

  return {
    schemaVersion: 1,
    outcome: result.outcome,
    checkedAt: input.checkedAt.toISOString(),
    durationMs: result.durationMs,
    httpStatus: result.httpStatus,
    finalOrigin: result.finalOrigin,
    redirectCount: result.redirectCount,
    methodUsed: result.methodUsed,
    errorCode: result.errorCode,
    errorSummary: result.errorSummary,
  };
}

function asHealthResult(result: PinnedProbeResponse, startedAt: number): HealthResult {
  return { ...result, durationMs: durationSince(startedAt) };
}

export async function runRemoteHealthCheck(
  db: Database,
  input: RunRemoteHealthCheckInput,
): Promise<PersistedRemoteHealthObservation> {
  const target = await loadHealthCheckTarget(db, input.serverId, input.remoteId);
  const startedAt = Date.now();
  const deadlineAt = startedAt + Math.max(1, input.probeOptions.totalTimeoutMs);
  let eligibility;
  try {
    eligibility = await withDeadline(
      decideRemoteProbeEligibility(target, { resolve: input.resolve }),
      deadlineAt,
    );
  } catch (error) {
    if (!(error instanceof HealthCheckDeadlineError)) throw error;
    return persistHealthObservation(
      db,
      input,
      target.serverVersionId,
      totalTimeoutResult(startedAt, null),
    );
  }

  if (!eligibility.eligible || !eligibility.normalizedUrl) {
    return persistHealthObservation(db, input, target.serverVersionId, {
      outcome: eligibility.outcome,
      methodUsed: null,
      finalOrigin: null,
      httpStatus: null,
      redirectCount: 0,
      durationMs: durationSince(startedAt),
      errorCode: eligibility.outcome,
      errorSummary: eligibility.reason,
    });
  }

  const sharedProbeOptions = {
    resolve: input.resolve,
    ...input.probeOptions,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  };
  const headTimeoutMs = remainingTimeoutMs(deadlineAt);
  if (headTimeoutMs === null) {
    return persistHealthObservation(
      db,
      input,
      target.serverVersionId,
      totalTimeoutResult(startedAt, null),
    );
  }
  const headResult = await performPinnedProbe(eligibility.normalizedUrl, {
    ...sharedProbeOptions,
    method: "HEAD",
    totalTimeoutMs: headTimeoutMs,
  });
  let finalResult: HealthResult;
  if (headResult.httpStatus !== null && FALLBACK_TO_GET_STATUSES.has(headResult.httpStatus)) {
    const getTimeoutMs = remainingTimeoutMs(deadlineAt);
    finalResult =
      getTimeoutMs === null
        ? totalTimeoutResult(startedAt, "HEAD")
        : asHealthResult(
            await performPinnedProbe(eligibility.normalizedUrl, {
              ...sharedProbeOptions,
              method: "GET",
              totalTimeoutMs: getTimeoutMs,
            }),
            startedAt,
          );
  } else {
    finalResult = asHealthResult(headResult, startedAt);
  }

  return persistHealthObservation(db, input, target.serverVersionId, finalResult);
}
