# Portainer Deployment

This deployment targets Portainer Business Edition managing a Docker Standalone endpoint. Portainer clones the Git repository and builds one application image used by the web, migration, and worker services.

## Prerequisites

- A Docker Standalone environment managed by Portainer Business Edition
- An existing external Docker network named `proxy`
- Nginx Proxy Manager attached to the `proxy` network
- DNS for `themcpdirectory.org` pointing to the proxy host
- Enough free disk space to build the complete pnpm workspace

The production stack does not publish application or PostgreSQL ports on the host. Nginx Proxy Manager reaches the web service through the shared `proxy` network.

## Portainer Stack

In Portainer, select **Stacks**, **Add stack**, then **Git repository** and configure:

| Setting                      | Value                        |
| ---------------------------- | ---------------------------- |
| Repository                   | This repository's Git URL    |
| Repository reference         | `refs/heads/main`            |
| Compose path                 | `compose.portainer.yml`      |
| Enable relative path volumes | Off                          |
| GitOps updates               | Off for the first deployment |

Add these environment variables in Portainer:

| Variable                | Value                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| `POSTGRES_DB`           | `mcpdirectory`                                                            |
| `POSTGRES_USER`         | `mcpdirectory`                                                            |
| `POSTGRES_PASSWORD`     | A long, randomly generated password                                       |
| `DATABASE_URL`          | `postgresql://mcpdirectory:<encoded-password>@postgres:5432/mcpdirectory` |
| `MCP_REGISTRY_BASE_URL` | `https://registry.modelcontextprotocol.io`                                |
| `NEXT_PUBLIC_BASE_URL`  | `https://themcpdirectory.org`                                             |
| `GITHUB_TOKEN`          | Optional GitHub token for higher enrichment rate limits                   |

Percent-encode reserved URL characters in the password used by `DATABASE_URL`. The unencoded value must still be supplied separately as `POSTGRES_PASSWORD`. Do not set `THEMCP_TEST_ADMIN_DATABASE_URL` or commit production values to an environment file.

Deploy the stack. Expected service state after startup:

- `postgres`: running and healthy
- `migrate`: exited successfully with code `0`
- `web`: running and healthy
- `worker`: running

The worker queues an Official MCP Registry synchronisation when it starts. The web directory can initially show no servers while that first synchronisation is running. Do not run the deterministic development seed in production.

## Nginx Proxy Manager

Create a Proxy Host with:

| Setting               | Value                 |
| --------------------- | --------------------- |
| Domain Names          | `themcpdirectory.org` |
| Scheme                | `http`                |
| Forward Hostname / IP | `mcpdirectory-web`    |
| Forward Port          | `3000`                |
| Websockets Support    | On                    |

Issue a Let's Encrypt certificate, enable **Force SSL**, and verify these routes through the public domain:

- `/`
- `/search`
- `/categories`
- `/robots.txt`
- `/sitemap.xml`

## Updates

The stack uses Compose `pull_policy: build`, which rebuilds the application image from the latest Git checkout when Portainer applies the stack. After the first successful manual deployment, GitOps updates can use either polling or a webhook.

Keep the GitOps **Force redeployment** option off during normal operation because it recreates the stack on every poll or webhook. Use Portainer's manual **Pull and redeploy** action or restart an individual container for a one-off operation. Each worker restart attempts to enqueue one singleton Registry synchronisation job, so run only one worker container.

Before deploying a database schema change, take a PostgreSQL backup. For example, from the Docker host:

```sh
docker exec <postgres-container> pg_dump -U mcpdirectory -d mcpdirectory -Fc > mcpdirectory.dump
docker exec -i <postgres-container> pg_restore --list < mcpdirectory.dump > /dev/null
```

Copy the verified dump off the Docker host. Regularly test restoration on a disposable database; an untested backup is not a recovery plan.

The migration service runs committed Drizzle migrations before the updated web and worker services start. If migration fails, those services remain stopped and the migration logs should be inspected before retrying.

## Rollback

Disable GitOps updates during recovery. For a Git-backed stack, either change **Edit Git settings** to an existing immutable release tag or revert the deployment commit on the tracked branch, then use **Pull and redeploy**. Portainer's stack revision selector is not available for Git-backed stacks.

Application rollback does not automatically reverse database migrations. Keep migrations backwards compatible with the previous application revision. When that is not possible, stop Web and Worker, restore the verified pre-deployment database dump, and deploy its matching application revision before restoring public traffic.

For reproducible multi-version rollback and faster deployments, publish commit-tagged images to a container registry in a later deployment phase. The current host-built image flow is intentionally the smallest operational setup for the MVP.
