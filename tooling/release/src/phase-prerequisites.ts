import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface PhasePrerequisite {
  readonly phase: "D" | "E" | "F" | "G";
  readonly capability: string;
  readonly artefacts: readonly string[];
  readonly probes: readonly string[];
  readonly command: string;
}

export const PHASE_PREREQUISITE_MATRIX = [
  {
    phase: "D",
    capability: "Contract schemas and deterministic OpenAPI",
    artefacts: [
      "packages/api-contract/src/public-api/shared.ts",
      "packages/api-contract/src/public-api/errors.ts",
      "packages/api-contract/src/public-api/servers.ts",
      "packages/api-contract/src/public-api/install.ts",
      "packages/api-contract/src/public-api/discovery.ts",
      "packages/api-contract/src/public-api/openapi.ts",
      "packages/api-contract/src/index.ts",
      "packages/api-contract/src/__tests__/shared-contract.test.ts",
      "packages/api-contract/src/__tests__/client-parsers.test.ts",
      "packages/api-contract/src/__tests__/servers-contract.test.ts",
      "packages/api-contract/src/__tests__/install-discovery-contract.test.ts",
      "packages/api-contract/src/__tests__/openapi.test.ts",
    ],
    probes: [
      "GET /api/v1/openapi.json",
      "GET /api/v1/servers/github",
      "GET /api/v1/resolve/github/install",
      "GET /api/v1/clients/codex",
      "GET /api/v1/clients/vscode",
    ],
    command:
      "pnpm --filter @themcpdirectory/api-contract exec vitest run src/__tests__/shared-contract.test.ts src/__tests__/client-parsers.test.ts src/__tests__/servers-contract.test.ts src/__tests__/install-discovery-contract.test.ts src/__tests__/openapi.test.ts && pnpm --filter @themcpdirectory/api-contract typecheck",
  },
  {
    phase: "D",
    capability: "Search pagination and ranking",
    artefacts: [
      "packages/search/src/public-api/types.ts",
      "packages/search/src/public-api/query-fingerprint.ts",
      "packages/search/src/public-api/cursor.ts",
      "packages/search/src/public-api/server-projections.ts",
      "packages/search/src/public-api/search-servers-page.ts",
      "packages/search/src/__tests__/cursor.test.ts",
      "packages/search/src/__tests__/search-servers-page.integration.test.ts",
    ],
    probes: [
      "GET /api/v1/servers?limit=30",
      "GET /api/v1/search?q=github",
      "GET /api/v1/servers?sort=recent",
    ],
    command:
      "pnpm --filter @themcpdirectory/search exec vitest run src/__tests__/cursor.test.ts src/__tests__/search-servers-page.integration.test.ts && pnpm --filter @themcpdirectory/search typecheck",
  },
  {
    phase: "D",
    capability: "Public detail, resolve, install, and discovery projections",
    artefacts: [
      "packages/domain/src/public-api/server-detail.ts",
      "packages/domain/src/public-api/resolve-server-identifier.ts",
      "packages/domain/src/public-api/install-manifest.ts",
      "packages/domain/src/public-api/categories.ts",
      "packages/domain/src/public-api/publishers.ts",
      "packages/domain/src/public-api/clients.ts",
      "packages/domain/src/public-api/__tests__/server-detail.integration.test.ts",
      "packages/domain/src/public-api/__tests__/resolve-server-identifier.integration.test.ts",
      "packages/domain/src/public-api/__tests__/install-manifest.integration.test.ts",
      "packages/domain/src/public-api/__tests__/discovery.integration.test.ts",
    ],
    probes: [
      "GET /api/v1/servers/github",
      "GET /api/v1/resolve/github-server",
      "GET /api/v1/resolve/github/install",
      "GET /api/v1/categories",
      "GET /api/v1/publishers/github",
      "GET /api/v1/clients",
    ],
    command:
      "pnpm --filter @themcpdirectory/domain exec vitest run src/public-api/__tests__/server-detail.integration.test.ts src/public-api/__tests__/resolve-server-identifier.integration.test.ts src/public-api/__tests__/install-manifest.integration.test.ts src/public-api/__tests__/discovery.integration.test.ts && pnpm --filter @themcpdirectory/domain typecheck",
  },
  {
    phase: "D",
    capability: "API middleware, routes, and empty-database behaviour",
    artefacts: [
      "apps/api/src/app.ts",
      "apps/api/src/http/request-id.ts",
      "apps/api/src/http/errors.ts",
      "apps/api/src/http/logging.ts",
      "apps/api/src/http/rate-limit.ts",
      "apps/api/src/http/cors.ts",
      "apps/api/src/http/cache.ts",
      "apps/api/src/routes/servers.ts",
      "apps/api/src/routes/search.ts",
      "apps/api/src/routes/resolve.ts",
      "apps/api/src/routes/install.ts",
      "apps/api/src/routes/categories.ts",
      "apps/api/src/routes/publishers.ts",
      "apps/api/src/routes/clients.ts",
      "apps/api/src/__tests__/middleware.test.ts",
      "apps/api/src/__tests__/error-boundary.test.ts",
      "apps/api/src/__tests__/public-api-core.integration.test.ts",
      "apps/api/src/__tests__/public-api-discovery.integration.test.ts",
      "apps/api/src/__tests__/empty-database.integration.test.ts",
      "apps/api/src/index.test.ts",
    ],
    probes: [
      "GET /api/v1/servers",
      "GET /api/v1/search?q=github",
      "GET /api/v1/resolve/github-server",
      "GET /api/v1/servers/github/install",
      "GET /api/v1/categories",
      "GET /api/v1/clients",
      "freshly migrated empty-database boot smoke",
    ],
    command:
      "pnpm --filter @themcpdirectory/api exec vitest run src/__tests__/middleware.test.ts src/__tests__/error-boundary.test.ts src/__tests__/public-api-core.integration.test.ts src/__tests__/public-api-discovery.integration.test.ts src/__tests__/empty-database.integration.test.ts src/index.test.ts && pnpm --filter @themcpdirectory/api typecheck && pnpm --filter @themcpdirectory/api build && pnpm --filter @themcpdirectory/config exec vitest run src/env.test.ts",
  },
  {
    phase: "E",
    capability: "Directory transport layer",
    artefacts: [
      "packages/directory-client/src/errors.ts",
      "packages/directory-client/src/client.ts",
      "packages/directory-client/src/fixtures.ts",
      "packages/directory-client/src/index.ts",
      "packages/directory-client/src/__tests__/client.test.ts",
      "packages/test-utils/src/directory-api-server.ts",
    ],
    probes: [
      "GET /api/v1/resolve/github-server",
      "GET /api/v1/resolve/github/install",
      "GET /api/v1/search?q=github-server",
      "GET /api/v1/clients",
    ],
    command:
      "pnpm --filter @themcpdirectory/directory-client exec vitest run src/__tests__/client.test.ts && pnpm --filter @themcpdirectory/directory-client typecheck && pnpm --filter @themcpdirectory/test-utils typecheck",
  },
  {
    phase: "E",
    capability: "Install intent resolution and plan validation",
    artefacts: [
      "packages/install-engine/src/semver.ts",
      "packages/install-engine/src/errors.ts",
      "packages/install-engine/src/types.ts",
      "packages/install-engine/src/select-variant.ts",
      "packages/install-engine/src/input-resolution.ts",
      "packages/install-engine/src/intent.ts",
      "packages/install-engine/src/hash.ts",
      "packages/install-engine/src/validate-plan.ts",
      "packages/install-engine/src/__tests__/semver.test.ts",
      "packages/install-engine/src/__tests__/select-variant.test.ts",
      "packages/install-engine/src/__tests__/input-resolution.test.ts",
      "packages/install-engine/src/__tests__/intent.test.ts",
      "packages/install-engine/src/__tests__/validate-plan.test.ts",
    ],
    probes: [
      "mcpdir add github-server --dry-run --json",
      "mcpdir add github-server --to codex --dry-run --json",
    ],
    command:
      "pnpm --filter @themcpdirectory/install-engine exec vitest run src/__tests__/semver.test.ts src/__tests__/select-variant.test.ts src/__tests__/input-resolution.test.ts src/__tests__/intent.test.ts src/__tests__/validate-plan.test.ts && pnpm --filter @themcpdirectory/install-engine typecheck",
  },
  {
    phase: "E",
    capability: "Client adapters",
    artefacts: [
      "packages/client-adapters/src/catalog.ts",
      "packages/client-adapters/src/types.ts",
      "packages/client-adapters/src/runtime.ts",
      "packages/client-adapters/src/registry.ts",
      "packages/client-adapters/src/codex.ts",
      "packages/client-adapters/src/claude-code.ts",
      "packages/client-adapters/src/cursor-json.ts",
      "packages/client-adapters/src/cursor-deeplink.ts",
      "packages/client-adapters/src/cursor.ts",
      "packages/client-adapters/src/vscode-json.ts",
      "packages/client-adapters/src/vscode.ts",
      "packages/client-adapters/src/index.ts",
      "packages/client-adapters/src/__tests__/catalog.test.ts",
      "packages/client-adapters/src/__tests__/registry.test.ts",
      "packages/client-adapters/src/__tests__/codex.test.ts",
      "packages/client-adapters/src/__tests__/claude-code.test.ts",
      "packages/client-adapters/src/__tests__/cursor.test.ts",
      "packages/client-adapters/src/__tests__/vscode.test.ts",
    ],
    probes: [
      "mcpdir add github-server --to codex --dry-run --json",
      "mcpdir add github-server --to claude-code --dry-run --json",
      "mcpdir add github-server --to cursor --dry-run --json",
      "mcpdir add github-server --to vscode --dry-run --json",
      "mcpdir doctor --json",
    ],
    command:
      "pnpm --filter @themcpdirectory/client-adapters exec vitest run src/__tests__/catalog.test.ts src/__tests__/registry.test.ts src/__tests__/codex.test.ts src/__tests__/claude-code.test.ts src/__tests__/cursor.test.ts src/__tests__/vscode.test.ts && pnpm --filter @themcpdirectory/client-adapters typecheck",
  },
  {
    phase: "E",
    capability: "CLI command surface, receipts, and built binary smoke",
    artefacts: [
      "packages/cli/tsconfig.build.json",
      "packages/cli/src/config/runtime.ts",
      "packages/cli/src/config/state-paths.ts",
      "packages/cli/src/config/file-lock.ts",
      "packages/cli/src/config/receipt-store.ts",
      "packages/cli/src/output/redaction.ts",
      "packages/cli/src/output/render.ts",
      "packages/cli/src/output/json.ts",
      "packages/cli/src/commands/result.ts",
      "packages/cli/src/commands/search.ts",
      "packages/cli/src/commands/info.ts",
      "packages/cli/src/commands/add-plan.ts",
      "packages/cli/src/commands/add-execute.ts",
      "packages/cli/src/commands/list.ts",
      "packages/cli/src/commands/remove.ts",
      "packages/cli/src/commands/update.ts",
      "packages/cli/src/commands/doctor.ts",
      "packages/cli/src/cli.ts",
      "packages/cli/src/index.ts",
      "packages/cli/src/__tests__/state-paths.test.ts",
      "packages/cli/src/__tests__/receipt-store.test.ts",
      "packages/cli/src/__tests__/search-info.test.ts",
      "packages/cli/src/__tests__/add-planning.test.ts",
      "packages/cli/src/__tests__/add-execution.test.ts",
      "packages/cli/src/__tests__/list-remove.test.ts",
      "packages/cli/src/__tests__/update.test.ts",
      "packages/cli/src/__tests__/doctor.test.ts",
      "packages/cli/src/__tests__/integration-cli.test.ts",
      "packages/cli/src/__tests__/binary-smoke.test.ts",
    ],
    probes: [
      "mcpdir search github-server --json",
      "mcpdir info github-server --json",
      "mcpdir add github-server --dry-run --json",
      "mcpdir list --json",
      "mcpdir doctor --json",
      "built mcpdir --help smoke",
    ],
    command:
      "pnpm --filter @themcpdirectory/cli exec vitest run src/__tests__/state-paths.test.ts src/__tests__/receipt-store.test.ts src/__tests__/search-info.test.ts src/__tests__/add-planning.test.ts src/__tests__/add-execution.test.ts src/__tests__/list-remove.test.ts src/__tests__/update.test.ts src/__tests__/doctor.test.ts src/__tests__/integration-cli.test.ts src/__tests__/binary-smoke.test.ts && pnpm --filter @themcpdirectory/cli typecheck && pnpm --filter @themcpdirectory/cli build",
  },
  {
    phase: "F",
    capability: "Remote probe transport hardening",
    artefacts: [
      "packages/security/src/url.ts",
      "packages/security/src/remote-probe.ts",
      "packages/security/src/index.ts",
      "packages/security/src/__tests__/remote-probe.test.ts",
    ],
    probes: [
      "bounded HTTPS probe classification",
      "redirect revalidation",
      "DNS pinning",
      "private-address rejection",
    ],
    command:
      "pnpm --filter @themcpdirectory/security exec vitest run src/__tests__/remote-probe.test.ts && pnpm --filter @themcpdirectory/security typecheck",
  },
  {
    phase: "F",
    capability: "Trust, health, public projection, and worker retention",
    artefacts: [
      "packages/domain/src/health/remote-probe-eligibility.ts",
      "packages/domain/src/health/run-remote-health-check.ts",
      "packages/domain/src/health/get-latest-remote-health.ts",
      "packages/domain/src/trust/refresh-trust-profile.ts",
      "packages/domain/src/trust/get-current-trust-profile.ts",
      "packages/domain/src/public-api/server-detail.ts",
      "packages/domain/src/public-api/resolve-server-identifier.ts",
      "packages/domain/src/public-api/install-manifest.ts",
      "packages/search/src/public-api/types.ts",
      "packages/search/src/public-api/server-projections.ts",
      "packages/search/src/public-api/search-servers-page.ts",
      "apps/worker/src/trust-health-config.ts",
      "apps/worker/src/trust-health-jobs.ts",
      "apps/worker/src/retention.ts",
      "apps/worker/src/__tests__/trust-health-worker.test.ts",
      "packages/domain/src/health/__tests__/remote-probe-eligibility.test.ts",
      "packages/domain/src/health/__tests__/run-remote-health-check.integration.test.ts",
      "packages/domain/src/trust/__tests__/refresh-trust-profile.integration.test.ts",
      "packages/domain/src/public-api/__tests__/server-detail.integration.test.ts",
      "packages/domain/src/public-api/__tests__/resolve-server-identifier.integration.test.ts",
      "packages/domain/src/public-api/__tests__/install-manifest.integration.test.ts",
      "packages/search/src/__tests__/search-servers-page.integration.test.ts",
    ],
    probes: [
      "server detail includes trustProfile, latestHealth, and installAvailability",
      "deleted-upstream install returns 410 UPSTREAM_DELETED",
      "search excludes deleted_upstream by default",
    ],
    command:
      "pnpm --filter @themcpdirectory/domain exec vitest run src/health/__tests__/remote-probe-eligibility.test.ts src/health/__tests__/run-remote-health-check.integration.test.ts src/trust/__tests__/refresh-trust-profile.integration.test.ts src/public-api/__tests__/server-detail.integration.test.ts src/public-api/__tests__/resolve-server-identifier.integration.test.ts src/public-api/__tests__/install-manifest.integration.test.ts && pnpm --filter @themcpdirectory/search exec vitest run src/__tests__/search-servers-page.integration.test.ts && pnpm --filter @themcpdirectory/worker exec vitest run src/__tests__/trust-health-worker.test.ts && pnpm --filter @themcpdirectory/domain typecheck && pnpm --filter @themcpdirectory/search typecheck && pnpm --filter @themcpdirectory/worker typecheck",
  },
  {
    phase: "G",
    capability: "Better Auth runtime and GitHub App verification",
    artefacts: [
      "packages/auth/src/better-auth.ts",
      "packages/auth/src/capabilities.ts",
      "packages/auth/src/session.ts",
      "packages/auth/src/request-guards.ts",
      "packages/auth/src/__tests__/better-auth.test.ts",
      "packages/auth/src/__tests__/capabilities.test.ts",
      "packages/auth/src/__tests__/github-oauth-flow.integration.test.ts",
    ],
    probes: [
      "/sign-in",
      "Better Auth session cookie handling",
      "GitHub App callback replay rejection",
      "GitHub App callback expiry rejection",
    ],
    command:
      "pnpm --filter @themcpdirectory/auth exec vitest run src/__tests__/better-auth.test.ts src/__tests__/capabilities.test.ts src/__tests__/github-oauth-flow.integration.test.ts && pnpm --filter @themcpdirectory/auth typecheck",
  },
  {
    phase: "G",
    capability: "Publisher claims, memberships, export, erasure, and workers",
    artefacts: [
      "packages/domain/src/publisher/dashboard.ts",
      "packages/domain/src/publisher/memberships.ts",
      "packages/domain/src/publisher/audit.ts",
      "packages/domain/src/publisher/github-app-client.ts",
      "packages/domain/src/publisher/claims.ts",
      "packages/domain/src/publisher/account-export.ts",
      "packages/domain/src/publisher/account-erasure.ts",
      "packages/domain/src/publisher/trust-refresh.ts",
      "packages/domain/src/publisher/retention.ts",
      "packages/domain/src/publisher/__tests__/dashboard.integration.test.ts",
      "packages/domain/src/publisher/__tests__/memberships.integration.test.ts",
      "packages/domain/src/publisher/__tests__/claims.integration.test.ts",
      "packages/domain/src/publisher/__tests__/account-export.integration.test.ts",
      "packages/domain/src/publisher/__tests__/account-erasure.integration.test.ts",
      "apps/worker/src/publisher-outbox-worker.ts",
      "apps/worker/src/publisher-erasure-worker.ts",
      "apps/worker/src/publisher-retention-worker.ts",
      "apps/worker/src/__tests__/publisher-outbox-worker.test.ts",
      "apps/worker/src/__tests__/publisher-erasure-worker.test.ts",
      "apps/worker/src/__tests__/publisher-retention-worker.test.ts",
    ],
    probes: [
      "claim verify start and callback",
      "claim withdrawal",
      "export and erasure endpoints",
      "outbox delivery and retention sweep",
    ],
    command:
      "pnpm --filter @themcpdirectory/domain exec vitest run src/publisher/__tests__/dashboard.integration.test.ts src/publisher/__tests__/memberships.integration.test.ts src/publisher/__tests__/claims.integration.test.ts src/publisher/__tests__/account-export.integration.test.ts src/publisher/__tests__/account-erasure.integration.test.ts && pnpm --filter @themcpdirectory/worker exec vitest run src/__tests__/publisher-outbox-worker.test.ts src/__tests__/publisher-erasure-worker.test.ts src/__tests__/publisher-retention-worker.test.ts",
  },
  {
    phase: "G",
    capability: "Publisher web routes and deterministic authenticated fixtures",
    artefacts: [
      "apps/web/src/app/api/auth/[...all]/route.ts",
      "apps/web/src/app/api/publisher/v1/_shared/route-helpers.ts",
      "apps/web/src/app/api/publisher/v1/session/route.ts",
      "apps/web/src/app/api/publisher/v1/claims/route.ts",
      "apps/web/src/app/api/publisher/v1/claims/[claimId]/verify/route.ts",
      "apps/web/src/app/api/publisher/v1/claims/verify/callback/route.ts",
      "apps/web/src/app/api/publisher/v1/claims/[claimId]/withdraw/route.ts",
      "apps/web/src/app/api/publisher/v1/memberships/[membershipId]/route.ts",
      "apps/web/src/app/api/publisher/v1/account/export/route.ts",
      "apps/web/src/app/api/publisher/v1/account/erasure/route.ts",
      "apps/web/src/app/sign-in/page.tsx",
      "apps/web/src/app/dashboard/layout.tsx",
      "apps/web/src/app/dashboard/page.tsx",
      "apps/web/src/app/dashboard/listings/[id]/page.tsx",
      "apps/web/e2e/setup/publisher-session-fixtures.ts",
      "apps/web/e2e/publisher-auth.spec.ts",
      "apps/web/e2e/publisher-dashboard.spec.ts",
      "apps/web/e2e/publisher-claims.spec.ts",
      "apps/web/e2e/contrast.spec.ts",
    ],
    probes: [
      "/sign-in",
      "authenticated /dashboard and listing detail",
      "same-origin publisher mutations",
      "export and erasure flows",
    ],
    command:
      "pnpm --filter @themcpdirectory/web exec playwright test e2e/publisher-auth.spec.ts e2e/publisher-dashboard.spec.ts e2e/publisher-claims.spec.ts e2e/contrast.spec.ts && pnpm --filter @themcpdirectory/web typecheck",
  },
] as const satisfies readonly PhasePrerequisite[];

type PathExists = (absolutePath: string) => Promise<boolean>;
type RunCommand = (command: string, rootDirectory: string) => Promise<void>;

export interface VerifyPhasePrerequisitesOptions {
  readonly rootDirectory?: string;
  readonly pathExists?: PathExists;
  readonly run?: RunCommand;
}

export class PhasePrerequisiteFailure extends Error {
  readonly missingArtefacts: readonly string[];
  readonly failedCapability: string | null;

  constructor(input: {
    message: string;
    missingArtefacts?: readonly string[];
    failedCapability?: string | null;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "PhasePrerequisiteFailure";
    this.missingArtefacts = input.missingArtefacts ?? [];
    this.failedCapability = input.failedCapability ?? null;
  }
}

async function defaultPathExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function defaultRun(command: string, rootDirectory: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      cwd: rootDirectory,
      env: process.env,
      shell: process.env.SHELL ?? "/bin/sh",
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Gate exited with ${signal ? `signal ${signal}` : `code ${code}`}.`));
    });
  });
}

export async function verifyPhasePrerequisites(
  options: VerifyPhasePrerequisitesOptions = {},
): Promise<{ readonly verifiedCapabilities: number }> {
  const rootDirectory =
    options.rootDirectory ?? fileURLToPath(new URL("../../../", import.meta.url));
  const pathExists = options.pathExists ?? defaultPathExists;
  const run = options.run ?? defaultRun;
  const missingArtefacts: string[] = [];

  for (const entry of PHASE_PREREQUISITE_MATRIX) {
    for (const artefact of entry.artefacts) {
      if (!(await pathExists(path.join(rootDirectory, artefact)))) {
        missingArtefacts.push(artefact);
      }
    }
  }

  if (missingArtefacts.length > 0) {
    throw new PhasePrerequisiteFailure({
      message: `Phase H is blocked by ${missingArtefacts.length} missing Phase D-G artefact(s).`,
      missingArtefacts,
    });
  }

  for (const entry of PHASE_PREREQUISITE_MATRIX) {
    try {
      await run(entry.command, rootDirectory);
    } catch (cause) {
      throw new PhasePrerequisiteFailure({
        message: `Phase ${entry.phase} prerequisite failed: ${entry.capability}.`,
        failedCapability: `${entry.phase}:${entry.capability}`,
        cause,
      });
    }
  }

  return { verifiedCapabilities: PHASE_PREREQUISITE_MATRIX.length };
}