# Release Runbook

This runbook turns a reviewed commit into release-candidate evidence and, only after separate approval, a controlled production change. It does not grant permission to publish, tag, change DNS, configure external services, or deploy.

## Roles And Records

Assign one release operator and one independent approver. Record the candidate commit SHA, operator, approver, UTC start time, intended CLI version, intended Git tag, immutable GHCR tag, database backup location and restore result, CI run, release-report artefacts, smoke-test results, and final decision in the release record. Never put credentials, tokens, session data, private vulnerability reports, or database contents in that record.

Stop when any required value or approver is missing. The unresolved non-code gates are listed in [`docs/production-authorisation-blockers.md`](production-authorisation-blockers.md).

## Version And Changelog

1. Choose the release version before building the candidate. The repository and CLI currently use `0.1.0`; do not change versions merely to run verification.
2. For a CLI release, update `packages/cli/package.json` and the lockfile together. The packed binary reads that package version for `mcpdir --version`.
3. Prepare reviewed release notes from the commits since the last approved release. The repository does not currently maintain a `CHANGELOG.md`, so the release record must include the proposed notes before any external GitHub release is created.
4. Include user-visible changes, migrations, security or privacy effects, fixed defects, breaking changes, known limitations, and operator actions. Do not claim that an unpublished package or undeployed surface is available.
5. Re-run the full release gate after any version, lockfile, code, migration, or documentation change. Evidence from an earlier tree is invalid.

Creating a Git tag, GitHub release, or npm version is an external action and requires the explicit approvals in the blocker document.

## Build And Verification

Use a clean checkout of the exact candidate commit with Node.js `>=24.10 <25`, Corepack-selected pnpm `11.17.0`, Chromium, and a disposable PostgreSQL 17 instance whose administrative role may create and drop test databases.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @themcpdirectory/web exec playwright install chromium
pnpm verify:release
```

`pnpm verify:release` runs 17 checks sequentially and stops on the first failure. It does not publish to npm or deploy the stack. Retain the CI logs and the files under `test-results/release/`, including the Lighthouse and CLI tarball reports. Confirm the CLI report contains the candidate package version, exact allowlist, SHA-256, and completed smoke steps.

Do not waive a failing gate in place. Fix the owning code or documentation, review the change, and restart verification from the new commit.

## Pre-Deployment Authorisation

Before touching production, verify all blockers are recorded as satisfied and obtain a direct go/no-go decision from the authorised operator. In particular, require qualified legal sign-off, a tested private disclosure channel, production credentials and secrets, verified backup/restore evidence, and explicit approval for each requested external action.

An npm release and a container deployment are independent decisions. A green gate authorises neither.

## Backup And Image Pinning

1. Identify the last known-good application image and candidate image by immutable `sha-<full-commit-sha>` GHCR tags. Record their resolved digests.
2. Before a schema change, create a PostgreSQL custom-format backup as described in [`docs/deployment.md`](deployment.md), verify it with `pg_restore --list`, copy it off the Docker host, and restore it into a disposable database.
3. Record the restore command, completion time, and a non-sensitive validation result. A dump that has not been restored is not verified recovery evidence.
4. Set Portainer `APP_IMAGE` to the approved immutable candidate tag. Do not deploy the mutable `main` tag when a reproducible release or rollback is required.

## Migration And Service Order

The required logical order for a complete deployment is:

1. Keep PostgreSQL healthy and take the verified backup.
2. Pull the candidate image without changing running services.
3. Run committed Drizzle migrations once and require exit code `0`.
4. Start or replace the stateless API and web services, then require their health checks to pass.
5. Start or replace the single worker only after the schema and request-serving processes are healthy.
6. Route the candidate through an access-restricted preview hostname or operator-only proxy path that uses production TLS termination.
7. Run the applicable smoke tests through that restricted route.
8. Enable unrestricted public routing only after smoke tests pass.

The current Portainer stack enforces `postgres -> migrate -> web and worker`, starts web and worker in parallel after migration, and has no standalone API service. It therefore does not implement the complete order above. Do not advertise the production API or publisher workflows until the stack includes the API, passes the full web authentication environment, starts the worker last, and has been reviewed and release-tested.

For the currently supported anonymous web/worker stack, use Portainer Business Edition **Pull and redeploy**, require `migrate` to exit successfully, require `web` to become healthy, and confirm exactly one worker is running. Do not run the deterministic development seed in production.

## Health And Smoke Checks

Run pre-public checks through the access-restricted preview hostname or operator-only proxy path after deployment, not only from inside a container. After the restricted checks pass and unrestricted routing is approved, repeat the applicable checks through the canonical public TLS endpoint.

### Infrastructure

- PostgreSQL reports healthy and accepts `SELECT 1` through the application network.
- `migrate` exited with code `0` and did not restart.
- Web is healthy at `/` and its container restart count is stable.
- Exactly one worker is running; inspect structured logs for startup, queue creation, Registry synchronization, trust refresh, publisher outbox, erasure, and retention failures. The worker has no HTTP health endpoint.
- Nginx Proxy Manager presents the expected certificate and redirects HTTP to HTTPS.

### Anonymous Web

- `GET /`, `/search?q=github`, `/categories`, a known canonical detail route, `/robots.txt`, and `/sitemap.xml` return expected non-error responses.
- A known alias redirects to the canonical detail URL.
- Security headers and the production nonce CSP are present on HTML responses.
- Search and detail content reflect the expected database state; no development seed claim is inferred from an empty first synchronization.

### Standalone API, When Deployed

- `GET /` returns `{ "status": "ok" }` on the API service.
- `GET /api/v1/openapi.json`, `/api/v1/search?q=github`, `/api/v1/servers/github`, and `/api/v1/clients` return schema-valid success responses.
- The public proxy preserves request IDs, cache headers, CORS policy, rate limits, and `/api/v1` paths.

### Publisher Authentication, When Enabled

- GitHub OAuth callback URLs and the GitHub App setup URL use the production origin.
- Sign-in completes with a dedicated release account and does not persist GitHub access, refresh, installation, or ID tokens.
- Dashboard reads and a non-destructive claim-verification start complete with private-cache headers and same-origin mutation enforcement.

Do not test destructive account erasure, membership removal, DNS changes, or real claims during a routine smoke test unless the release plan explicitly provisions disposable production fixtures and authorises those actions.

## Stop, Rollback, Or Forward-Fix

Stop the rollout before routing traffic when migration fails, a required secret is absent, a service is unhealthy, the candidate SHA or image digest does not match the release record, or a mandatory smoke check fails.

Roll back the application to the recorded last known-good immutable image when migrations did not run or remain backwards compatible, and the previous application can safely use the current schema. Use Portainer **Pull and redeploy**, then repeat all applicable health and smoke checks.

Prefer a forward fix when a migration has committed and the previous application is incompatible, when reverting would discard valid writes accepted after deployment, or when the defect can be corrected without restoring data. Build a new commit and image, run `pnpm verify:release` again, obtain renewed approval, and deploy the new immutable tag.

Restore the database only when data is corrupted or an incompatible migration cannot be safely forward-fixed. Enter maintenance, stop web, API, and worker writers, preserve incident evidence, restore the verified pre-deployment backup, deploy the matching application revision, validate schema and data, and complete smoke checks before restoring traffic. Never assume application rollback reverses Drizzle migrations.

Escalate immediately for suspected credential exposure, authorization bypass, personal-data exposure, destructive migration behavior, or active exploitation. Preserve logs without copying secrets or personal data into public channels.

## Known Limitations

- The CLI package is `private`, `UNLICENSED`, and not published to npm. The tarball gate is verification, not publication.
- No open-source license has been selected; repository and package metadata grant no redistribution permission.
- Privacy and Terms are drafts pending qualified legal approval.
- A configured, monitored, and tested responsible-disclosure contact is still required before launch wording can be final.
- The current Portainer stack omits the standalone API and publisher-authentication/GitHub App environment, and starts web and worker in parallel after migration.
- The worker has no HTTP readiness endpoint and only one worker instance is supported by the current operating guidance.
- Registry synchronization is queued at worker startup; no recurring Registry schedule is currently documented.
- The GHCR publish workflow and CI run independently on `main`; image existence does not prove release verification passed.
- Portainer rollback changes the application image only and never reverses database migrations.
- Lighthouse reports are controlled lab evidence, not field Core Web Vitals.

## Final Approval And Closeout

Before execution, record separate approvals for the production deployment, npm publication, Git tag, GitHub release, DNS change, GHCR visibility change, OAuth/GitHub App configuration, and secret configuration. Mark actions that are out of scope as not requested rather than implicitly approved.

After smoke checks, the operator records one outcome: released, rolled back, forward-fix in progress, or aborted. Record the deployed commit, image digest, database migration state, backup identifier, check results, incidents, and follow-up owner. Remove temporary credentials and disposable fixtures, retain release evidence according to the approved retention policy, and do not publish availability claims until the approver confirms closeout.
