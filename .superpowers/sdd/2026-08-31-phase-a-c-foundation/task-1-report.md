# Task 1 Report — Monorepo Foundation

**Commit:** `4b8a811`
**Date:** 2026-08-31
**Status:** Completed

---

## Files Changed (105 files, 6773 insertions)

### New root-level config

- `.env.example` — environment variable template (DATABASE_URL, MCP_REGISTRY_BASE_URL, WEB_PORT, API_PORT, GITHUB_TOKEN)
- `.npmrc` — `engine-strict=false`, `strict-peer-dependencies=true`
- `.nvmrc` — Node 24
- `.prettierignore` — excludes `.next`, `dist`, `docs/ai-docs` (spec files preserved)
- `.prettierrc.json` — printWidth 100, trailingComma all, singleQuote false

### CI

- `.github/workflows/ci.yml` — Ubuntu runner, Node 24, pnpm 11; gates: install → format:check → lint → typecheck → test → build

### apps/api (new)

- `package.json` — `@themcpdirectory/api`, Hono 4.7.11 dep, `build: tsc --noEmit`
- `tsconfig.json` / `tsconfig.build.json` — extends `node.json`
- `eslint.config.mjs` — re-exports base config
- `vitest.config.ts` — node environment
- `src/index.ts` — minimal Hono scaffold (`GET /` → `{status:"ok"}`)

### apps/worker (new)

- Same structure as api; `src/index.ts` is an empty stub (job runner is a future phase)

### packages/config (TDD — full implementation)

- `src/env.ts` — Zod schema: `DATABASE_URL` (url), `MCP_REGISTRY_BASE_URL` (url), `WEB_PORT` (coerce int, default 3000), `API_PORT` (coerce int, default 3001), `GITHUB_TOKEN` (optional); exports `loadEnv(raw?)` and `Env` type
- `src/index.ts` — re-exports `loadEnv` and `Env`
- `src/env.test.ts` — 9 unit tests (see TDD evidence below)
- `vitest.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `package.json`

### packages/* stubs (13 packages)

api-contract, auth, cli, client-adapters, db, domain, install-engine, registry-client, registry-normalizer, search, security, test-utils, ui — each has:

- `package.json` with name, version 0.1.0, lint/test/typecheck scripts
- `tsconfig.json` extending `@themcpdirectory/typescript-config/node.json`
- `eslint.config.mjs` re-exporting base ESLint config
- `src/index.ts` placeholder (`export {}`)
- `eslint: 9.39.5` as a direct devDependency (required for pnpm binary isolation)

### tooling/vitest (new)

- `package.json` — `@themcpdirectory/vitest-config`
- `base.ts` — shared Vitest defineConfig (node environment, v8 coverage)

---

## Design Choices

1. **apps/api and apps/worker `build` = `tsc --noEmit`**: Real compilation (esbuild/tsc emit) deferred to the task that implements API/worker behavior. This avoids tsconfig.build.json complexity and keeps turbo build passing cleanly.
2. **`eslint: 9.39.5` direct dep in every package**: pnpm's strict isolation means the `eslint` binary must be a direct or linked dependency — it does not traverse transitive deps for binaries. All packages that run `eslint .` need it explicitly.
3. **`tooling/vitest` exports `base.ts`**: Provides a shared Vitest config base for future packages that need coverage. Stub packages use `vitest run --passWithNoTests` without importing the base (they have no tests yet).
4. **`packages/cli` is `"private": false`**: The spec says it will be published to npm as `@themcpdirectory/cli`. The bin entry points to `src/cli.ts` as a stub; this won't be executable until the CLI task builds it.
5. **Spec docs excluded from Prettier**: `.prettierignore` has `docs/ai-docs` to preserve authoritative spec formatting.

---

## TDD Evidence — packages/config/src/env

### Red Phase (23:04:03)

```
 FAIL  src/env.test.ts [ src/env.test.ts ]
Error: Cannot find module './env.js' imported from .../packages/config/src/env.test.ts
 Test Files  1 failed (1) / Tests  no tests
```

Test file existed, `env.ts` did not — correct RED failure.

### Green Phase (23:04:29)

```
 RUN  v4.1.11 /Users/timohaseloff/themcpdirectory/packages/config
 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  127ms
```

All 9 tests green after minimal `loadEnv` + Zod schema implementation.

---

## Verification Commands and Results

All run from workspace root `/Users/timohaseloff/themcpdirectory`:

| Command             | Result                                                              |
| ------------------- | ------------------------------------------------------------------- |
| `pnpm format:check` | ✅ All matched files use Prettier code style                        |
| `pnpm lint`         | ✅ Tasks: 17 successful, 17 total                                   |
| `pnpm typecheck`    | ✅ Tasks: 17 successful, 17 total                                   |
| `pnpm test`         | ✅ Tasks: 17 successful, 17 total (9 unit tests in packages/config) |
| `pnpm build`        | ✅ Tasks: 3 successful, 3 total                                     |

Turbo task counts: 17 workspaces have lint/typecheck/test scripts (root + 3 apps + 13 packages + 3 tooling). 3 workspaces have build scripts (web, api, worker).

Node 26 locally emits the expected engine warning (`wanted: {"node":">=24 <25"}`) on every pnpm command — this is intentional and expected per task brief.

---

## Commit

```
hash: 4b8a811
message: chore: initialize monorepo foundation
files: 105 changed, 6773 insertions(+), 1 deletion(-)
```

---

## Concerns

1. **`apps/api` and `apps/worker` `build` scripts are `tsc --noEmit`**: This satisfies the `pnpm build` gate but produces no artifact. The task implementing the API/worker behavior must update these to emit compiled output. This is intentional for Task 1 scope.
2. **turbo build warns "no output files found" for api and worker**: Expected since build=typecheck produces no dist/. Turbo will not cache these tasks. Once real compilation is added these warnings will resolve.
3. **CI uses `pnpm@11` (version specifier, not exact)**: pnpm 11.17.0 is the pinned version; the action will resolve to the latest 11.x. Pinning to `11.17.0` would be safer but requires a custom action setup.
4. **`packages/cli` bin points to `src/cli.ts`**: This is invalid as a runtime entrypoint (TypeScript source). Future CLI task must update this to compiled output or use ts-node/tsx at runtime.

---

## Fix Round 1

**Commit:** `72a552a`
**Date:** 2026-08-31

### Changed Files (11 files)

| File                              | Change                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/package.json`           | Add `tsx@4.23.13` devDep; build → `tsc -p tsconfig.build.json`; add `start` script                                                      |
| `apps/api/tsconfig.build.json`    | Add `"noEmit": false` to override base inheritance and emit JS into `dist/`                                                             |
| `apps/worker/package.json`        | Add `tsx@4.23.13` devDep; build → `tsc -p tsconfig.build.json`; add `start` script                                                      |
| `apps/worker/tsconfig.build.json` | Add `"noEmit": false` to override base inheritance and emit JS into `dist/`                                                             |
| `.github/workflows/ci.yml`        | Pin pnpm action to exact `11.17.0` (was `11`)                                                                                           |
| `apps/web/tsconfig.json`          | Remove deprecated `baseUrl`; keep `@/*` paths alias                                                                                     |
| `packages/cli/package.json`       | Set `"private": true`; remove premature `bin` entry                                                                                     |
| `apps/web/src/app/page.tsx`       | Replace broken scaffold (missing SVGs, Vercel/Next.js branding) with minimal branded placeholder: skip link + `<h1>` + coming-soon text |
| `apps/web/src/app/layout.tsx`     | Update metadata title/description from Create Next App defaults                                                                         |
| `pnpm-workspace.yaml`             | Approve `esbuild` builds (`allowBuilds: esbuild: true`) — required by tsx's transitive dep                                              |
| `pnpm-lock.yaml`                  | Updated to include `tsx@4.23.13` for api and worker                                                                                     |

### Focused Executable Check

```
apps/api/node_modules/.bin/tsx --version  → tsx v4.23.13
apps/worker/node_modules/.bin/tsx --version → tsx v4.23.13
node apps/api/dist/index.js  → exit 0 (no syntax/resolution errors)
node apps/worker/dist/index.js → exit 0 (no syntax/resolution errors)
```

### Full Verification Evidence

| Command             | Result                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| `pnpm install`      | ✅ Done in 733ms                                                              |
| `pnpm format:check` | ✅ All matched files use Prettier code style                                  |
| `pnpm lint`         | ✅ Tasks: 17 successful, 17 total (4.664s)                                    |
| `pnpm typecheck`    | ✅ Tasks: 17 successful, 17 total (3.604s)                                    |
| `pnpm test`         | ✅ Tasks: 17 successful, 17 total (FULL TURBO)                                |
| `pnpm build`        | ✅ Tasks: 3 successful, 3 total (4.032s); api and worker emit `dist/index.js` |

### Concerns

1. **tsx version `4.23.13` (not a lock-range)**: Using the exact latest version at time of fix. This is appropriate — the lockfile pins the resolved hash. The `packageManager` field and `pnpm-lock.yaml` together ensure reproducibility.
2. **esbuild allowBuilds**: tsx transitively requires esbuild which has install scripts. Approving esbuild builds is required for any project using tsx, esbuild, or Vite. This was the correct fix; no security concern — esbuild is a widely-used, audited tool.
3. **Worker `dist/index.js` is a no-op module** (`export {}`): This is correct for Task 1 scope. The actual worker jobs are a future phase. The `start` script exists and the file is invokable without errors.
