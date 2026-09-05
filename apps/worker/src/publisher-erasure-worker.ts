import { createSign } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import type { Database } from "@themcpdirectory/db";
import { publisherClaims } from "@themcpdirectory/db";
import type { WebEnv } from "@themcpdirectory/config";
import { resumeRetryableAccountErasure, type AccountErasureDeps } from "@themcpdirectory/domain";

export const PUBLISHER_ERASURE_QUEUE = "publisher.erasure";

const GITHUB_API_BASE_URL = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;
const APP_JWT_LIFETIME_SECONDS = 540;

type GitHubErasureEnv = Pick<WebEnv, "GITHUB_APP_ID" | "GITHUB_APP_PRIVATE_KEY">;

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signAppJwt(env: GitHubErasureEnv, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / 1000) - 60;
  const unsigned = `${base64UrlEncodeJson({ alg: "RS256", typ: "JWT" })}.${base64UrlEncodeJson({
    iat: issuedAt,
    exp: issuedAt + APP_JWT_LIFETIME_SECONDS,
    iss: env.GITHUB_APP_ID,
  })}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .end()
    .sign(env.GITHUB_APP_PRIVATE_KEY, "base64url");
  return `${unsigned}.${signature}`;
}

function asEvidenceObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("GITHUB_APP_EVIDENCE_INVALID");
  }
  return value as Record<string, unknown>;
}

function parseInstallationIdStrict(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  throw new Error("GITHUB_APP_INSTALLATION_ID_INVALID");
}

function parseInstallationIdIfPresent(value: unknown): number | null {
  if (value === undefined) return null;
  return parseInstallationIdStrict(value);
}

function isOwnedUserInstallationEvidence(evidenceSummary: unknown): {
  installationId: number;
} | null {
  const evidence = asEvidenceObject(evidenceSummary);
  const installationId = parseInstallationIdIfPresent(evidence.installationId);
  if (installationId === null) return null;

  const githubUserId = evidence.githubUserId;
  const installationTargetType = evidence.installationTargetType;
  const installationTargetId = evidence.installationTargetId;

  if (
    typeof githubUserId === "string" &&
    githubUserId.length > 0 &&
    installationTargetType === "user" &&
    installationTargetId === githubUserId
  ) {
    return { installationId };
  }

  return null;
}

async function loadOwnedInstallationIds(db: Database, userId: string): Promise<readonly number[]> {
  const userClaims = await db
    .select({ evidenceSummary: publisherClaims.evidenceSummary })
    .from(publisherClaims)
    .where(
      and(eq(publisherClaims.status, "verified"), eq(publisherClaims.requesterUserId, userId)),
    );

  const candidateIds = new Set<number>();
  for (const claim of userClaims) {
    const ownedInstallation = isOwnedUserInstallationEvidence(claim.evidenceSummary);
    if (ownedInstallation) candidateIds.add(ownedInstallation.installationId);
  }
  if (candidateIds.size === 0) return [];

  const otherClaims = await db
    .select({ evidenceSummary: publisherClaims.evidenceSummary })
    .from(publisherClaims)
    .where(
      and(eq(publisherClaims.status, "verified"), ne(publisherClaims.requesterUserId, userId)),
    );

  const sharedIds = new Set<number>();
  for (const claim of otherClaims) {
    const evidence = asEvidenceObject(claim.evidenceSummary);
    const installationId = parseInstallationIdIfPresent(evidence.installationId);
    if (installationId !== null && candidateIds.has(installationId)) {
      sharedIds.add(installationId);
    }
  }

  return [...candidateIds]
    .filter((installationId) => !sharedIds.has(installationId))
    .sort((a, b) => a - b);
}

async function disconnectInstallation(input: {
  env: GitHubErasureEnv;
  installationId: number;
  operationId: string;
  fetchImpl: typeof fetch;
}): Promise<void> {
  const { env, installationId, operationId, fetchImpl } = input;
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw new Error("GITHUB_APP_INSTALLATION_ID_INVALID");
  }

  let response: Response;
  try {
    response = await fetchImpl(
      `${GITHUB_API_BASE_URL}/app/installations/${encodeURIComponent(String(installationId))}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${signAppJwt(env, new Date())}`,
          accept: "application/vnd.github+json",
          "x-github-idempotency-key": operationId,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
  } catch {
    throw new Error("GITHUB_APP_DISCONNECT_FAILED");
  }

  if (response.status === 204 || response.status === 404) {
    return;
  }

  throw new Error(`GITHUB_APP_DISCONNECT_FAILED_${response.status}`);
}

export function createAccountErasureDeps(input: {
  db: Database;
  env: GitHubErasureEnv;
  fetchImpl?: typeof fetch;
}): AccountErasureDeps {
  const fetchImpl = input.fetchImpl ?? fetch;

  return {
    githubApp: {
      disconnectOwnedInstallations: async ({ userId, operationId }) => {
        const installationIds = await loadOwnedInstallationIds(input.db, userId);
        for (const installationId of installationIds) {
          await disconnectInstallation({ env: input.env, installationId, operationId, fetchImpl });
        }
        return { disconnectedInstallationIds: installationIds };
      },
    },
  };
}

export async function processPublisherErasureJob(
  db: Database,
  checkedAt = new Date(),
  deps: AccountErasureDeps,
): Promise<{ resumed: number; completed: number; retryScheduled: number }> {
  return resumeRetryableAccountErasure(db, { now: checkedAt }, deps);
}
