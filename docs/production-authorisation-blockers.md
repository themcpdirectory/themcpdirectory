# Production Authorisation Blockers

Engineering verification can produce a release candidate, but it cannot grant legal, security, infrastructure, or publication authority. No approval is granted by this document, by a green CI run, or by `pnpm verify:release`.

Production launch remains blocked until every applicable item below has a named owner, dated evidence, and explicit approval recorded outside the repository. Secrets and personal data must not be copied into that record.

## Legal And Governance

- A qualified legal reviewer has approved the final Privacy and Terms text, including lawful bases, processors, international transfers, retention, governing law, and contact wording.
- Draft labels are removed only after that approval. Engineering checks are not legal advice.
- The operator has decided whether the repository and CLI remain `UNLICENSED` or adopt a specific open-source license. Any change requires an explicit repository decision before public npm publication or public license claims.
- The release owner has approved the final version and release notes without unsupported availability, security, accessibility, or service-level claims.

## Security And Privacy Operations

- A private responsible-disclosure channel is configured, monitored, and tested end to end. `SECURITY.md` and `/security` identify it only after verification.
- Production log access, redaction, retention, alerting, and incident ownership are approved. Logs must not retain OAuth codes, access or installation tokens, session cookies, secrets, or unnecessary personal data.
- Production data retention, account export, erasure, legal-hold, outbox, and dormant-account procedures have named operators and monitoring.
- The production dependency-audit triage has no expired or unowned exception, and any accepted finding has a recorded owner, justification, and expiry.

## Identity And External Services

- A production Better Auth secret of at least 32 characters is generated and stored in the approved secret manager.
- The GitHub OAuth application and GitHub App are provisioned under the approved organisation with exact production callback/setup URLs and least-privilege permissions.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_APP_SLUG` are configured and tested without exposing their values.
- `NEXT_PUBLIC_BASE_URL` and optional `BETTER_AUTH_URL` use the canonical HTTPS origin; Better Auth trusted origins resolve to that same origin.
- The public API has an approved `API_CURSOR_SIGNING_SECRET`, CORS allowlist, rate limits, canonical base URL, and proxy route before it is announced.
- Any optional GitHub enrichment token is separately scoped, stored, rotated, and monitored.

## Infrastructure And Recovery

- The reviewed Portainer stack configuration matches the intended API and web proxy routes, least-privilege service environments, health checks, and service ordering for the exact candidate commit.
- The exact candidate commit has a green `pnpm verify:release` result and retained release reports on supported Node.js 24.
- The immutable GHCR image tag and digest match that commit. CI and **Publish container** both passed for the same SHA.
- GHCR package visibility and pull credentials are approved. Making a package public is an external, potentially irreversible action.
- A current PostgreSQL backup has been verified with `pg_restore --list`, restored successfully into a disposable database, copied off-host, and linked to the release record.
- The rollback image, forward-fix owner, maintenance procedure, recovery time expectation, and database-restore decision owner are recorded.
- Portainer Business Edition, Nginx Proxy Manager, TLS, DNS, the external `proxy` network, monitoring, and access controls are reviewed by the responsible operator.

## Publication And Change Authority

The following actions each require explicit, action-specific operator approval and credentials:

- merge or push to `main` when it triggers GHCR publication
- change GHCR package visibility
- use Portainer **Pull and redeploy**
- change DNS or proxy configuration
- configure or rotate production secrets
- create or push a Git tag
- create a GitHub release
- publish `@themcpdirectory/cli` to npm
- claim and publish the unscoped `mcpdir` package to npm after the matching canonical CLI version
- change repository or package licensing

The canonical package is published as `@themcpdirectory/cli@0.2.1`. npm rejected initial registration of `mcpdir` because the name was considered too similar to an existing package. Publishing the unscoped wrapper remains blocked on npm Support approval; until then, public copy must use the scoped command and must not claim `npx mcpdir` is available.

## Authorisation Record

For each requested action, record:

| Field     | Required value                                                                  |
| --------- | ------------------------------------------------------------------------------- |
| Candidate | Full commit SHA and immutable artefact digest or tarball SHA-256                |
| Action    | One precise external action; do not bundle unrelated permissions                |
| Owner     | Person executing the action                                                     |
| Approver  | Person authorised to approve it                                                 |
| Evidence  | Green gate, legal/security review, backup restore, and smoke plan as applicable |
| Decision  | Approved or rejected, with UTC timestamp and scope                              |
| Outcome   | Completed, rolled back, aborted, or superseded                                  |

Silence, repository access, prior approval for another environment, and a successful automated check are not authorisation.
