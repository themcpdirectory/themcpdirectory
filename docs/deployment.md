# Portainer Deployment Reference

This reference describes the intended Portainer Business Edition deployment on a Docker Standalone endpoint. GitHub Actions builds one application image for the web, migration, and worker services and publishes it to the GitHub Container Registry (GHCR). Portainer only pulls the published image; it does not build on the Docker host.

> **Current deployment status: Blocked.** `compose.portainer.yml` does not define or proxy the standalone `apps/api` service, and its web and worker environments do not include the Better Auth and GitHub App variables required by publisher sign-in, claims, and account-erasure jobs. It also starts web and worker in parallel after migration. Do not deploy this incomplete stack to production. Every applicable item in [`docs/production-authorisation-blockers.md`](production-authorisation-blockers.md) must have recorded evidence and approval before any command or UI procedure below is executed.

The remaining sections are a future operator reference, not current deployment authorization. After the stack wiring is implemented, reviewed, and release-tested, an authorised operator must still approve each requested external action separately.

## Release Verification

Before any deployment decision, run `pnpm verify:release` on supported Node.js 24 or require a green CI run for the exact commit. This gate verifies the repository and produces release evidence; it does not publish to npm, publish a container, create a Git tag or GitHub release, change DNS, configure secrets, or deploy the stack.

Use an immutable `sha-<full-commit-sha>` GHCR tag for deployment and recovery. A successful **Publish container** workflow proves that an image was built and pushed, not that CI passed: both workflows currently start independently on pushes to `main`. The operator must verify both results for the same full commit SHA.

See [`docs/release-runbook.md`](release-runbook.md) for the controlled sequence and [`docs/production-authorisation-blockers.md`](production-authorisation-blockers.md) for approvals that no repository command can grant.

## Prerequisites

- A Docker Standalone environment managed by Portainer Business Edition
- An existing external Docker network named `proxy`
- Nginx Proxy Manager attached to the `proxy` network
- DNS for `themcpdirectory.org` pointing to the proxy host
- GitHub Actions enabled for the repository

The production stack does not publish application or PostgreSQL ports on the host. Nginx Proxy Manager reaches the web service through the shared `proxy` network.

## Container Image

The [Publish container workflow](../.github/workflows/publish-container.yml) runs after every push to `main` and can also be started manually. It publishes these tags:

- `ghcr.io/themcpdirectory/themcpdirectory:main` for the latest successful `main` build
- `ghcr.io/themcpdirectory/themcpdirectory:sha-<full-commit-sha>` for an immutable deployment and rollback target

Only after the current deployment blockers are resolved and the action-specific approvals are recorded:

1. Obtain explicit approval to merge or push the deployment changes to `main`.
2. Wait for both **CI** and **Publish container** to finish successfully for the same commit.
3. Configure an approved private GHCR pull credential in Portainer, or obtain separate approval to make the package public.
4. Confirm that Portainer can pull the immutable candidate tag using the approved visibility and credential model.

New GHCR packages are private by default, even when linked to a public repository. Making the package public is an external visibility change and requires explicit approval; it is not a prerequisite when Portainer has an approved registry credential.

## Portainer Stack

After the blocking stack changes and approvals are complete, select **Stacks**, **Add stack**, then **Git repository** in Portainer and configure:

| Setting                      | Value                        |
| ---------------------------- | ---------------------------- |
| Repository                   | This repository's Git URL    |
| Repository reference         | `refs/heads/main`            |
| Compose path                 | `compose.portainer.yml`      |
| Enable relative path volumes | Off                          |
| GitOps updates               | Off for the first deployment |

Add these environment variables in Portainer:

| Variable                        | Value                                                               |
| ------------------------------- | ------------------------------------------------------------------- |
| `POSTGRES_DB`                   | `mcpdirectory`                                                      |
| `POSTGRES_USER`                 | `mcpdirectory`                                                      |
| `POSTGRES_PASSWORD`             | A long URL-safe password, for example from `openssl rand -hex 32`   |
| `MCP_REGISTRY_BASE_URL`         | `https://registry.modelcontextprotocol.io`                          |
| `NEXT_PUBLIC_BASE_URL`          | Approved canonical HTTPS web origin                                 |
| `BETTER_AUTH_URL`               | Optional `/api/auth` URL on the canonical web origin                |
| `BETTER_AUTH_SECRET`            | Secret-manager value with at least 32 characters                    |
| `GITHUB_CLIENT_ID`              | Approved production GitHub OAuth application client ID              |
| `GITHUB_CLIENT_SECRET`          | Secret-manager value for the production OAuth application           |
| `GITHUB_APP_ID`                 | Numeric ID of the approved production GitHub App                    |
| `GITHUB_APP_PRIVATE_KEY`        | Private key loaded from the approved secret manager                 |
| `GITHUB_APP_SLUG`               | Slug of the approved production GitHub App                          |
| `API_BASE_URL`                  | Approved canonical HTTPS API origin                                 |
| `API_CORS_ALLOWED_ORIGINS`      | Comma-separated canonical web origins; do not use `*` in production |
| `API_CURSOR_SIGNING_SECRET`     | Independent secret-manager value with at least 32 characters        |
| `API_RATE_LIMIT_WINDOW_SECONDS` | Approved positive integer window                                    |
| `API_RATE_LIMIT_MAX_READS`      | Approved positive integer read limit                                |
| `GITHUB_TOKEN`                  | Optional GitHub token for higher enrichment rate limits             |
| `APP_IMAGE`                     | Immutable `sha-...` image tag for the approved candidate            |

The reviewed replacement stack must pass the API values to the API service and the Better Auth and GitHub App values to both web and worker. It derives the internal `DATABASE_URL` from the PostgreSQL settings, so do not add it separately. Keep `POSTGRES_USER`, `POSTGRES_DB`, and `POSTGRES_PASSWORD` URL-safe because they form that connection URL. Do not set `THEMCP_TEST_ADMIN_DATABASE_URL` or commit production values to an environment file.

Deploy only the reviewed, complete stack. Expected service state after startup:

- `postgres`: running and healthy
- `migrate`: exited successfully with code `0`
- `api`: running and healthy
- `web`: running and healthy
- `worker`: running

The worker queues an Official MCP Registry synchronisation when it starts. The web directory can initially show no servers while that first synchronisation is running. Do not run the deterministic development seed in production.

## Nginx Proxy Manager

After deployment approval, create an access-restricted preview hostname in Nginx Proxy Manager with:

| Setting               | Value                                            |
| --------------------- | ------------------------------------------------ |
| Domain Names          | Approved non-public release-preview hostname     |
| Scheme                | `http`                                           |
| Forward Hostname / IP | `mcpdirectory-web`                               |
| Forward Port          | `3000`                                           |
| Websockets Support    | On                                               |
| Access List           | Approved operator IP allowlist or authentication |

Issue a valid certificate, enable **Force SSL**, and verify these routes through the access-restricted TLS endpoint:

- `/`
- `/search`
- `/categories`
- `/robots.txt`
- `/sitemap.xml`

After every applicable health and smoke check in the release runbook passes and public routing has separate approval, configure the canonical hostname with the same upstream and TLS policy. Enable unrestricted public routing only after smoke tests pass. Repeat the applicable smoke checks through the canonical public endpoint and restore the access restriction immediately if any check fails.

## Updates

The stack uses Compose `pull_policy: always`. Portainer pulls an already published image whenever it applies or redeploys the stack.

After production deployment is unblocked, use this sequence for an approved update:

1. Record the approved candidate commit and intended immutable GHCR tag.
2. Merge the change to `main` only after explicit approval.
3. Wait for both CI and the **Publish container** workflow to pass for that commit.
4. Set `APP_IMAGE` to the candidate's immutable `sha-<full-commit-sha>` tag.
5. In Portainer, open the stack and use **Pull and redeploy**.
6. Confirm that `migrate` exits successfully and that `web` and `worker` are running.

Keep GitOps updates disabled unless deployment ordering is automated separately. A Git poll can detect the commit before GitHub Actions has finished publishing its image. Restarting an individual container is also insufficient for an image update because it reuses the existing container. Each worker recreation attempts to enqueue one singleton Registry synchronisation job, so run only one worker container.

Before deploying a database schema change, take a PostgreSQL backup. For example, from the Docker host:

```sh
docker exec <postgres-container> pg_dump -U mcpdirectory -d mcpdirectory -Fc > mcpdirectory.dump
docker exec -i <postgres-container> pg_restore --list < mcpdirectory.dump > /dev/null
```

Copy the verified dump off the Docker host. Regularly test restoration on a disposable database; an untested backup is not a recovery plan.

The migration service runs committed Drizzle migrations before the updated web and worker services start. If migration fails, those services remain stopped and the migration logs should be inspected before retrying.

### Password authentication failures

The PostgreSQL image only uses `POSTGRES_PASSWORD` while initialising an empty data directory. Changing the Portainer variable later does not update the database role stored in an existing `postgres-data` volume.

For a new deployment with no data to preserve, delete the failed stack, remove its `postgres-data` volume, and recreate the stack with the final `POSTGRES_PASSWORD`. Removing the volume permanently deletes its database contents.

To preserve an existing database, open a console on the PostgreSQL container and reset the role password through the local connection:

```sh
psql -U mcpdirectory -d postgres
\password mcpdirectory
\quit
```

Enter the same URL-safe password in the prompt and in Portainer's `POSTGRES_PASSWORD` variable, then use **Pull and redeploy**. Do not put the password directly in the console command because it would be retained in shell history and logs.

## Rollback

Disable GitOps updates during recovery. In the stack environment variables, set `APP_IMAGE` to the image for the last known-good commit, for example:

```text
ghcr.io/themcpdirectory/themcpdirectory:sha-0123456789abcdef0123456789abcdef01234567
```

Use **Pull and redeploy**, then verify the migration, web, and worker service states. Remove `APP_IMAGE`, or set it to the desired newer immutable tag, when the incident is resolved. The default `main` tag is convenient for normal deployments but is not a reproducible rollback target.

Application rollback does not automatically reverse database migrations. Keep migrations backwards compatible with the previous application revision. When that is not possible, stop Web and Worker, restore the verified pre-deployment database dump, and deploy its matching application revision before restoring public traffic.

Do not improvise recovery from this page alone. The release runbook defines when to stop, roll back only the application, forward-fix, or restore the database, along with the required post-action smoke checks.
