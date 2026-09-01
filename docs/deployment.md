# Portainer Deployment

This deployment targets Portainer Business Edition managing a Docker Standalone endpoint. GitHub Actions builds one application image for the web, migration, and worker services and publishes it to the GitHub Container Registry (GHCR). Portainer only pulls the published image; it does not build on the Docker host.

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

Before the first Portainer deployment:

1. Push or merge the deployment changes to `main`.
2. Wait for the **Publish container** workflow to finish successfully.
3. Open the `themcpdirectory` package in the GitHub organisation, select **Package settings**, then under **Danger Zone** select **Change visibility** and choose **Public**.
4. Confirm that the image can be pulled without authentication.

New GHCR packages are private by default, even when linked to a public repository. Making the package public is a one-time, irreversible setting and allows Portainer to pull without registry credentials. Subsequent image versions retain the package visibility.

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
| `APP_IMAGE`             | Optional immutable `sha-...` image tag; defaults to the `main` tag        |

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

The stack uses Compose `pull_policy: always`. Portainer pulls an already published image whenever it applies or redeploys the stack.

For a normal update:

1. Merge the change to `main`.
2. Wait for both CI and the **Publish container** workflow to pass.
3. In Portainer, open the stack and use **Pull and redeploy**.
4. Confirm that `migrate` exits successfully and that `web` and `worker` are running.

Keep GitOps updates disabled unless deployment ordering is automated separately. A Git poll can detect the commit before GitHub Actions has finished publishing its image. Restarting an individual container is also insufficient for an image update because it reuses the existing container. Each worker recreation attempts to enqueue one singleton Registry synchronisation job, so run only one worker container.

Before deploying a database schema change, take a PostgreSQL backup. For example, from the Docker host:

```sh
docker exec <postgres-container> pg_dump -U mcpdirectory -d mcpdirectory -Fc > mcpdirectory.dump
docker exec -i <postgres-container> pg_restore --list < mcpdirectory.dump > /dev/null
```

Copy the verified dump off the Docker host. Regularly test restoration on a disposable database; an untested backup is not a recovery plan.

The migration service runs committed Drizzle migrations before the updated web and worker services start. If migration fails, those services remain stopped and the migration logs should be inspected before retrying.

## Rollback

Disable GitOps updates during recovery. In the stack environment variables, set `APP_IMAGE` to the image for the last known-good commit, for example:

```text
ghcr.io/themcpdirectory/themcpdirectory:sha-0123456789abcdef0123456789abcdef01234567
```

Use **Pull and redeploy**, then verify the migration, web, and worker service states. Remove `APP_IMAGE`, or set it to the desired newer immutable tag, when the incident is resolved. The default `main` tag is convenient for normal deployments but is not a reproducible rollback target.

Application rollback does not automatically reverse database migrations. Keep migrations backwards compatible with the previous application revision. When that is not possible, stop Web and Worker, restore the verified pre-deployment database dump, and deploy its matching application revision before restoring public traffic.
