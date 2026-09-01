# Contributing

External code contributions are paused until the project selects licensing and contribution terms. Do not open a pull request unless a maintainer has invited the contribution. Security reports remain welcome through the private process in [SECURITY.md](SECURITY.md).

The workflow below applies to maintainers and invited contributors. Keep changes scoped to implemented behavior and treat the authoritative specifications in `docs/ai-docs` as future-facing unless code and tests already support a feature.

## Development Setup

Follow [docs/development.md](docs/development.md) to install dependencies, start PostgreSQL, apply migrations, seed data, and run the applications.

## Change Workflow

1. Create a branch from the latest `main`.
2. Make one coherent change at a time.
3. Add or update tests before implementation for behavior changes.
4. Run focused checks for the packages you touched.
5. Run the repository gates before opening a pull request.
6. Use a Conventional Commit subject such as `fix(search): preserve alias ranking`.

Do not combine unrelated refactors with feature or bug-fix work. Preserve public package exports and existing ownership boundaries unless the change explicitly requires an interface update.

## Architecture Boundaries

- Application composition belongs in `apps/web`, `apps/api`, or `apps/worker`.
- Framework-independent business behavior belongs in `packages/domain`.
- SQL schema and database clients belong in `packages/db`; reusable query construction belongs in `packages/search`.
- Registry HTTP contracts and deterministic normalization remain separate in `packages/registry-client` and `packages/registry-normalizer`.
- Outbound URL and SSRF controls belong in `packages/security`.
- UI packages must not import database code.
- CLI and client-adapter packages must not access the internal database.

Reserved packages such as auth, CLI, API contract, client adapters, and install engine are not implemented merely because their package boundary exists. Do not document or expose placeholder exports as shipped features.

## Tests

Use the narrowest command that proves the changed behavior while iterating:

```sh
pnpm --filter @themcpdirectory/<package> test
pnpm --filter @themcpdirectory/<package> typecheck
pnpm --filter @themcpdirectory/<package> lint
```

Before requesting review, run:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` includes the current PostgreSQL integration files. `pnpm test:integration` is an explicit release gate that presently repeats the same package Vitest suites; run it when release verification or a reviewer requests it.

Run `pnpm test:e2e` for public-route, accessibility, responsive-layout, metadata, or browser behavior changes.

Tests that need PostgreSQL must create isolated databases and clean them up. Do not point automated tests at shared, staging, or production databases. Regression tests should assert observable behavior rather than implementation text or mock existence.

## Database Changes

1. Change the Drizzle schema in `packages/db/src/schema`.
2. Run `pnpm db:generate`.
3. Inspect and, when needed, harden the generated SQL for populated upgrades.
4. Add migration tests for uniqueness, data preservation, and concurrency-sensitive lock ordering.
5. Commit the SQL migration, Drizzle metadata, schema changes, and tests together.

Never edit or reorder a migration that may already have been applied. Add a new migration instead. Data repair must be deterministic and auditable; do not delete user-visible records to satisfy a new constraint.

## Registry and External Data

Treat Registry records, repository metadata, URLs, descriptions, and package data as untrusted input.

- Validate external responses at the client boundary.
- Keep HTTP requests outside database transactions.
- Preserve immutable raw snapshots for provenance.
- Never execute Registry-provided strings as shell commands.
- Use the shared security package for outbound URL handling.
- Do not log access tokens, secrets, remote header values, or database credentials.

## Web and Accessibility

Public UI changes must retain semantic landmarks, one page-topic `h1`, visible labels, keyboard operation, visible focus, reduced-motion support, forced-colors support, and reflow at 320 CSS pixels. Use existing shared tokens and components rather than introducing parallel styles.

Browser changes should be checked at 320, 768, 1280, and 1536 CSS pixels. Do not claim full accessibility based only on automated tests; manual assistive-technology review remains valuable.

## Pull Requests

Describe:

- the user-visible or operational problem
- the chosen behavior and ownership boundary
- migrations or environment changes
- focused and repository-wide validation run
- known limitations or follow-up work

Confirm no secrets, local environment files, generated build output, Playwright reports, or unrelated formatter churn are included.

Security vulnerabilities must follow [SECURITY.md](SECURITY.md). Never disclose technical vulnerability details in a public issue or pull request.
