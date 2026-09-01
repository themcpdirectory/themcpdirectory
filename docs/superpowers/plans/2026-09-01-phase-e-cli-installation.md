# Phase E CLI Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cross-platform `mcpdir` CLI installation system that consumes the approved Phase D public API, renders reviewable client-independent install plans, and safely applies them across Codex, Claude Code, and Cursor.

**Architecture:** Phase E is downstream of Phase D. `packages/directory-client` is the only product-API transport layer and must consume the exact Phase D `/api/v1` response schemas and tolerant client parsers from `packages/api-contract`. `packages/install-engine` stays pure and deterministic, `packages/client-adapters` owns verified client mutations and diagnostics, and `packages/cli` owns command parsing, prompting, output, receipts, deterministic receipt-backed remove target discovery, and the built `mcpdir` binary.

**Tech Stack:** Node.js 24, TypeScript 5.9, pnpm 11, Zod 4.5.4 via the Phase D contract package, Vitest 4.1.11, `node:util.parseArgs`, `node:readline/promises`, `node:child_process`, `node:fs/promises`, and the existing semver parser semantics already proven in `packages/registry-normalizer`.

**Authorities:** `docs/superpowers/specs/2026-09-01-phase-e-cli-installation-design.md`, `docs/superpowers/specs/2026-09-01-phase-d-public-api-design.md`, `docs/superpowers/plans/2026-09-01-phase-d-public-api.md`, `docs/ai-docs/engineering-spec.md` sections 48-63 and 90, and the review report at `/Users/timohaseloff/Library/Application Support/Code/User/workspaceStorage/5669660f6066ba48fda746f0c894a67a/GitHub.copilot-chat/chat-session-resources/32faae66-68f7-406d-8ce1-a60cdedc39ff/call_W61iM07Wj23dD6lMcHN35ONZ__vscode-1788291491106/content.json`.

## Global Constraints

- Phase E consumes the exact Phase D schemas, envelopes, error codes, and tolerant client parsers. It does not create a second install-manifest or directory-response contract.
- The CLI must treat the configured base URL as the API root and preserve `/api/v1` during URL joins.
- Adapter behaviour is capability-gated. If a current client version or help output does not prove a command or flag, that feature is unsupported in Phase E.
- Remote authentication must be represented only as environment references, explicit persisted-secret consent, or client-owned OAuth follow-up. The CLI never captures or proxies OAuth credentials.
- Every CLI handler returns one consistent `CommandResult`. `runCli` is the only layer that writes stdout, stderr, and process exit codes.
- `mcpdir remove <slug>` without `--to` must discover targets deterministically from receipt-backed adapter state: exactly one installed target proceeds, more than one returns a structured ambiguity result listing the available targets, and zero returns a structured not-installed result. `--to` remains an explicit override.
- `update` and `doctor` are separate tasks with separate focused tests.
- Behaviour-level end-to-end coverage runs in process with dependency injection. A child-process test exists only as a built-binary smoke test.
- Phase E adds built binary packaging for `mcpdir`. Real tarball packaging and npm publication remain Phase H work.
- Exact version validation must use a semver parser, not a handwritten partial regex.
- Recovery hints must be derived from the actual target slug, client, scope, and operation result.
- Verification commands must use exact package filters and exact file paths.
- Keep the release gate in Phase H and preserve the per-task Conventional Commit checkpoints.

## Prerequisite Matrix

| Prerequisite                        | Source                                                                                                                            | Required baseline before Phase E code begins                                                                                                                                                   | Consumed by                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Public API route baseline           | `docs/superpowers/specs/2026-09-01-phase-d-public-api-design.md`                                                                  | `/api/v1/resolve`, `/api/v1/resolve/:identifier/install`, `/api/v1/search`, `/api/v1/servers/:slug`, and `/api/v1/clients` are implemented and return the approved `data` and `meta` envelopes | Tasks 1, 10, 11, 14, 15, 16          |
| Contract package baseline           | `docs/superpowers/plans/2026-09-01-phase-d-public-api.md`                                                                         | `packages/api-contract` already exports the exact Phase D strict server schemas, tolerant client parsers, `InstallManifestV1`, and `UnsupportedManifestVersionError` on Zod 4.5.4              | Tasks 1, 2, 3, 4, 10, 11, 14, 15     |
| Supported client catalogue baseline | `docs/superpowers/specs/2026-09-01-phase-e-cli-installation-design.md` and Phase D plan `packages/client-adapters/src/catalog.ts` | `codex`, `claude-code`, and `cursor` remain the only Phase E client IDs and the authoritative capability metadata source                                                                       | Tasks 5, 6, 7, 8, 11, 12, 13, 14, 15 |
| Semver parsing baseline             | `packages/registry-normalizer/src/index.ts`                                                                                       | Exact-version parsing already handles prerelease and build metadata, and Phase E must reuse these semantics rather than inventing a narrower matcher                                           | Tasks 2, 14, 15                      |
| CLI shipping baseline               | `docs/ai-docs/engineering-spec.md` sections 34 and 48-63                                                                          | `@themcpdirectory/cli` must build a `mcpdir` binary in Phase E, but publish, pack, and release automation stay deferred to Phase H                                                             | Tasks 9 and 16                       |

## File Map

### `packages/directory-client`

- Create `packages/directory-client/package.json`
- Create `packages/directory-client/tsconfig.json`
- Create `packages/directory-client/eslint.config.mjs`
- Create `packages/directory-client/vitest.config.ts`
- Create `packages/directory-client/src/errors.ts`
- Create `packages/directory-client/src/client.ts`
- Create `packages/directory-client/src/fixtures.ts`
- Create `packages/directory-client/src/__tests__/client.test.ts`
- Create `packages/directory-client/src/index.ts`

### `packages/test-utils`

- Create `packages/test-utils/src/directory-api-server.ts`
- Create `packages/test-utils/src/fake-process-runtime.ts`
- Create `packages/test-utils/src/cli-harness.ts`
- Modify `packages/test-utils/src/index.ts`

### `packages/install-engine`

- Create `packages/install-engine/src/semver.ts`
- Create `packages/install-engine/src/errors.ts`
- Create `packages/install-engine/src/types.ts`
- Create `packages/install-engine/src/select-variant.ts`
- Create `packages/install-engine/src/input-resolution.ts`
- Create `packages/install-engine/src/intent.ts`
- Create `packages/install-engine/src/hash.ts`
- Create `packages/install-engine/src/validate-plan.ts`
- Create `packages/install-engine/src/__tests__/semver.test.ts`
- Create `packages/install-engine/src/__tests__/select-variant.test.ts`
- Create `packages/install-engine/src/__tests__/input-resolution.test.ts`
- Create `packages/install-engine/src/__tests__/intent.test.ts`
- Create `packages/install-engine/src/__tests__/validate-plan.test.ts`
- Modify `packages/install-engine/src/index.ts`
- Modify `packages/install-engine/package.json`

### `packages/client-adapters`

- Create `packages/client-adapters/src/types.ts`
- Create `packages/client-adapters/src/runtime.ts`
- Create `packages/client-adapters/src/registry.ts`
- Create `packages/client-adapters/src/codex.ts`
- Create `packages/client-adapters/src/claude-code.ts`
- Create `packages/client-adapters/src/cursor-json.ts`
- Create `packages/client-adapters/src/cursor-deeplink.ts`
- Create `packages/client-adapters/src/cursor.ts`
- Create `packages/client-adapters/src/__tests__/registry.test.ts`
- Create `packages/client-adapters/src/__tests__/codex.test.ts`
- Create `packages/client-adapters/src/__tests__/claude-code.test.ts`
- Create `packages/client-adapters/src/__tests__/cursor.test.ts`
- Modify `packages/client-adapters/src/index.ts`
- Modify `packages/client-adapters/package.json`

### `packages/cli`

- Create `packages/cli/tsconfig.build.json`
- Create `packages/cli/src/dependencies.ts`
- Create `packages/cli/src/config/runtime.ts`
- Create `packages/cli/src/config/state-paths.ts`
- Create `packages/cli/src/config/file-lock.ts`
- Create `packages/cli/src/config/receipt-store.ts`
- Create `packages/cli/src/output/redaction.ts`
- Create `packages/cli/src/output/render.ts`
- Create `packages/cli/src/output/json.ts`
- Create `packages/cli/src/commands/result.ts`
- Create `packages/cli/src/commands/search.ts`
- Create `packages/cli/src/commands/info.ts`
- Create `packages/cli/src/commands/add-plan.ts`
- Create `packages/cli/src/commands/add-execute.ts`
- Create `packages/cli/src/commands/list.ts`
- Create `packages/cli/src/commands/remove.ts`
- Create `packages/cli/src/commands/update.ts`
- Create `packages/cli/src/commands/doctor.ts`
- Create `packages/cli/src/prompts/types.ts`
- Create `packages/cli/src/prompts/select-clients.ts`
- Create `packages/cli/src/prompts/select-variant.ts`
- Create `packages/cli/src/prompts/collect-inputs.ts`
- Create `packages/cli/src/prompts/confirm.ts`
- Create `packages/cli/src/__tests__/state-paths.test.ts`
- Create `packages/cli/src/__tests__/receipt-store.test.ts`
- Create `packages/cli/src/__tests__/search-info.test.ts`
- Create `packages/cli/src/__tests__/add-planning.test.ts`
- Create `packages/cli/src/__tests__/add-execution.test.ts`
- Create `packages/cli/src/__tests__/list-remove.test.ts`
- Create `packages/cli/src/__tests__/update.test.ts`
- Create `packages/cli/src/__tests__/doctor.test.ts`
- Create `packages/cli/src/__tests__/integration-cli.test.ts`
- Create `packages/cli/src/__tests__/binary-smoke.test.ts`
- Modify `packages/cli/src/index.ts`
- Modify `packages/cli/src/cli.ts`
- Modify `packages/cli/package.json`

### Documentation

- Modify `README.md`
- Modify `docs/development.md`

## No Phase E Changes

- Do not add new schema source files under `packages/api-contract/src/public-api`.
- Do not add new public API routes in `apps/api`.
- Do not move install-manifest logic back into `packages/domain` or `packages/search`; Phase D already owns those boundaries.

## Command Traceability Matrix

| User-visible command or flow            | Owning task(s)    | Focused verification                                                                                                                                                   |
| --------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcpdir search`                         | Task 10           | `packages/cli/src/__tests__/search-info.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`                                                                 |
| `mcpdir info <slug>`                    | Task 10           | `packages/cli/src/__tests__/search-info.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`                                                                 |
| `mcpdir add <slug>`                     | Tasks 11-12       | `packages/cli/src/__tests__/add-planning.test.ts`, `packages/cli/src/__tests__/add-execution.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`            |
| `mcpdir add <alias>`                    | Tasks 1, 11-12    | `packages/directory-client/src/__tests__/client.test.ts`, `packages/cli/src/__tests__/add-planning.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`      |
| `mcpdir add <slug> --to codex`          | Tasks 6, 11-12    | `packages/client-adapters/src/__tests__/codex.test.ts`, `packages/cli/src/__tests__/add-execution.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`       |
| `mcpdir add <slug> --to claude-code`    | Tasks 7, 11-12    | `packages/client-adapters/src/__tests__/claude-code.test.ts`, `packages/cli/src/__tests__/add-execution.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts` |
| `mcpdir add <slug> --to cursor`         | Tasks 8, 11-12    | `packages/client-adapters/src/__tests__/cursor.test.ts`, `packages/cli/src/__tests__/add-execution.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`      |
| `mcpdir add <slug> --to codex,cursor`   | Tasks 6, 8, 11-12 | `packages/cli/src/__tests__/add-planning.test.ts`, `packages/cli/src/__tests__/add-execution.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`            |
| `mcpdir add <slug> --to all`            | Tasks 11-12       | `packages/cli/src/__tests__/add-planning.test.ts`, `packages/cli/src/__tests__/add-execution.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`            |
| `mcpdir add <slug> --dry-run`           | Task 11           | `packages/cli/src/__tests__/add-planning.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`                                                                |
| interactive `All detected clients` flow | Tasks 5, 11-12    | `packages/cli/src/__tests__/add-planning.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`                                                                |
| `mcpdir list`                           | Task 13           | `packages/cli/src/__tests__/list-remove.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`                                                                 |
| `mcpdir remove <slug>`                  | Task 13           | `packages/cli/src/__tests__/list-remove.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`                                                                 |
| `mcpdir remove <slug> --to <client>`    | Task 13           | `packages/cli/src/__tests__/list-remove.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`                                                                 |
| `mcpdir update`                         | Task 14           | `packages/cli/src/__tests__/update.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`                                                                      |
| `mcpdir update <server>`                | Task 14           | `packages/cli/src/__tests__/update.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`                                                                      |
| `mcpdir doctor`                         | Task 15           | `packages/cli/src/__tests__/doctor.test.ts`, `packages/cli/src/__tests__/integration-cli.test.ts`                                                                      |
| built binary `mcpdir --help` smoke      | Tasks 9 and 16    | `packages/cli/src/__tests__/binary-smoke.test.ts`                                                                                                                      |

## Task Order

1. Directory transport and fake API baseline
2. Install-engine exact-version parsing and variant selection
3. Input resolution and remote-auth semantics
4. Install-plan hashing and validation
5. Adapter runtime and registry contracts
6. Codex adapter
7. Claude Code adapter
8. Cursor adapter and atomic config writes
9. CLI runtime, receipts, state paths, and built binary packaging
10. Command runner plus `search` and `info`
11. `add` planning, prompting, and dry-run
12. `add` execution, verification, receipts, and partial-failure recovery
13. `list` and `remove`
14. `update`
15. `doctor`
16. In-process integration, built-binary smoke, and documentation

### Task 1: Directory Transport And Fake API Baseline

**Files:**

- Create `packages/directory-client/package.json`
- Create `packages/directory-client/tsconfig.json`
- Create `packages/directory-client/eslint.config.mjs`
- Create `packages/directory-client/vitest.config.ts`
- Create `packages/directory-client/src/errors.ts`
- Create `packages/directory-client/src/client.ts`
- Create `packages/directory-client/src/fixtures.ts`
- Create `packages/directory-client/src/__tests__/client.test.ts`
- Create `packages/directory-client/src/index.ts`
- Create `packages/test-utils/src/directory-api-server.ts`
- Modify `packages/test-utils/src/index.ts`

**Interfaces:**

- Consumes the exact Phase D `InstallManifestV1`, `ResourceResponse`, `CollectionResponse`, `ErrorResponse`, and tolerant response parsers exported by `@themcpdirectory/api-contract`.
- Produces `interface DirectoryClientOptions { readonly baseUrl: string | URL; readonly timeoutMs?: number; readonly fetchImpl?: typeof fetch; readonly userAgent?: string; }`.
- Produces `interface SearchServersParams { readonly q?: string; readonly client?: ClientId; readonly category?: string; readonly cursor?: string; readonly limit?: number; readonly sort?: "recent" | "name" | "relevance"; }`.
- Produces `type DirectoryClientErrorCode = "DIRECTORY_HTTP_ERROR" | "DIRECTORY_TIMEOUT" | "DIRECTORY_INVALID_RESPONSE" | "DIRECTORY_AMBIGUOUS" | "DIRECTORY_INSTALL_UNAVAILABLE"`.
- Produces `class DirectoryClient` with `resolveServer(identifier: string)`, `resolveInstall(identifier: string)`, `getServer(slug: string)`, `searchServers(params: SearchServersParams)`, and `listClients()`.
- Produces `interface FixtureDirectoryApiServerOptions { readonly resolveServerBody?: unknown; readonly resolveInstallBody?: unknown; readonly searchBody?: unknown; readonly serverDetailBody?: unknown; readonly clientsBody?: unknown; readonly statusOverrides?: Partial<Record<"resolveServer" | "resolveInstall" | "search" | "serverDetail" | "clients", number>>; readonly onRequestPath?: (path: string) => void; }`.
- Produces `interface FixtureDirectoryApiServer { readonly baseUrl: string; close(): Promise<void>; }`.

- [ ] Write `packages/directory-client/src/__tests__/client.test.ts` to cover hosted and local-dev API roots preserving `/api/v1`, alias resolution, tolerant additive-field parsing, unsupported future manifest-version rejection, schema-invalid responses, and status mapping.
- [ ] Implement `DirectoryClient` so it normalises the API root once, always joins endpoint-relative paths without a leading slash, and never strips `/api/v1`.
- [ ] Implement the fake API server helper with request-path capture so the tests can prove the correct joined path instead of only checking parsed bodies.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/directory-client exec vitest run src/__tests__/client.test.ts
pnpm --filter @themcpdirectory/directory-client typecheck
pnpm --filter @themcpdirectory/test-utils typecheck
```

- [ ] Commit:

```bash
git add packages/directory-client packages/test-utils/src/directory-api-server.ts packages/test-utils/src/index.ts
git commit -m "feat(directory-client): add validated product api client"
```

### Task 2: Install-Engine Exact-Version Parsing And Variant Selection

**Files:**

- Create `packages/install-engine/src/semver.ts`
- Create `packages/install-engine/src/errors.ts`
- Create `packages/install-engine/src/types.ts`
- Create `packages/install-engine/src/select-variant.ts`
- Create `packages/install-engine/src/__tests__/semver.test.ts`
- Create `packages/install-engine/src/__tests__/select-variant.test.ts`
- Modify `packages/install-engine/src/index.ts`
- Modify `packages/install-engine/package.json`

**Interfaces:**

- Consumes the exact Phase D `InstallManifestV1`, `InstallManifestVariantV1`, `ClientId`, and client compatibility fields.
- Produces `interface ParsedSemVer { readonly major: number; readonly minor: number; readonly patch: number; readonly prerelease: readonly string[]; readonly build: readonly string[]; }`.
- Produces `function parseSemVer(value: string): ParsedSemVer | null` using the same acceptance rules already proven in `packages/registry-normalizer`.
- Produces `function assertExactPinnedVersion(value: string): string` that accepts exact stable, prerelease, and build-metadata versions and rejects ranges, tags, and empty values.
- Produces `type UnsupportedVariantReason = "CLIENT_INCOMPATIBLE" | "MUTABLE_VERSION" | "UNSUPPORTED_REGISTRY" | "UNSUPPORTED_TRANSPORT" | "MALFORMED_INTEGRITY"`.
- Produces `function selectInstallVariant(manifest: InstallManifestV1, client: ClientId, requestedVariantId?: string): InstallManifestVariantV1`.

- [ ] Write `packages/install-engine/src/__tests__/semver.test.ts` and `packages/install-engine/src/__tests__/select-variant.test.ts` to cover exact versions with prerelease and build metadata, deterministic compatible selection, explicit incompatible-variant failure, and malformed integrity rejection.
- [ ] Implement `packages/install-engine/src/semver.ts` by reusing the existing semver parsing semantics from `packages/registry-normalizer` instead of introducing a narrower regex.
- [ ] Implement variant selection so unsupported package registries, mutable versions, and incompatible transports fail before adapter planning begins.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/install-engine exec vitest run src/__tests__/semver.test.ts src/__tests__/select-variant.test.ts
pnpm --filter @themcpdirectory/install-engine typecheck
```

- [ ] Commit:

```bash
git add packages/install-engine/package.json packages/install-engine/src/semver.ts packages/install-engine/src/errors.ts packages/install-engine/src/types.ts packages/install-engine/src/select-variant.ts packages/install-engine/src/__tests__/semver.test.ts packages/install-engine/src/__tests__/select-variant.test.ts packages/install-engine/src/index.ts
git commit -m "feat(install-engine): add exact version parsing and variant selection"
```

### Task 3: Input Resolution And Remote-Auth Semantics

**Files:**

- Create `packages/install-engine/src/input-resolution.ts`
- Create `packages/install-engine/src/intent.ts`
- Create `packages/install-engine/src/__tests__/input-resolution.test.ts`
- Create `packages/install-engine/src/__tests__/intent.test.ts`
- Modify `packages/install-engine/src/types.ts`
- Modify `packages/install-engine/src/index.ts`

**Interfaces:**

- Consumes `InstallManifestV1`, `InstallInputDefinitionV1`, `ClientId`, and `ClientScope` from Phase D plus `selectInstallVariant` from Task 2.
- Produces `type InstallInputValue = { kind: "env-reference"; envName: string } | { kind: "text"; value: string } | { kind: "secret-value"; value: string; allowPersistence: true }`.
- Produces `type ValidatedInstallInputMap = ReadonlyMap<string, InstallInputValue>`.
- Produces `type RemoteAuthResolution = { kind: "none" } | { kind: "client-oauth"; followUpMessage: string } | { kind: "env-reference"; envName: string } | { kind: "persisted-secret"; value: string; requiresInteractiveConsent: true }`.
- Produces `interface ResolveIntentOptions { readonly client: ClientId; readonly scope: ClientScope; readonly requestedVariantId?: string; readonly inputValues: Record<string, InstallInputValue>; }`.
- Produces `interface ResolvedInstallIntent { readonly schemaVersion: 1; readonly server: { readonly slug: string; readonly title: string; readonly version: string }; readonly client: ClientId; readonly scope: ClientScope; readonly variant: InstallManifestVariantV1; readonly warnings: readonly string[]; readonly inputs: readonly InstallInputDefinitionV1[]; readonly remoteAuth: RemoteAuthResolution; readonly requiredEnvReferences: readonly string[]; }`.
- Produces `function validateInputValues(intent: ResolvedInstallIntent, values: Record<string, InstallInputValue>): ValidatedInstallInputMap`.
- Produces `function createResolvedInstallIntent(manifest: InstallManifestV1, options: ResolveIntentOptions): ResolvedInstallIntent`.

- [ ] Write `packages/install-engine/src/__tests__/input-resolution.test.ts` and `packages/install-engine/src/__tests__/intent.test.ts` for env-reference preference, explicit persisted-secret consent, noninteractive refusal when a client can only persist a secret, and client-owned OAuth follow-up semantics.
- [ ] Implement input resolution so Phase E keeps only variable names for env references, never serialises secret values into dry runs or receipts, and marks unverified client remote-auth flows as unsupported instead of guessing hidden flags.
- [ ] Implement resolved intents so they remain client-neutral and contain no executable paths, no shell strings, and no config file locations.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/install-engine exec vitest run src/__tests__/input-resolution.test.ts src/__tests__/intent.test.ts
pnpm --filter @themcpdirectory/install-engine typecheck
```

- [ ] Commit:

```bash
git add packages/install-engine/src/input-resolution.ts packages/install-engine/src/intent.ts packages/install-engine/src/types.ts packages/install-engine/src/__tests__/input-resolution.test.ts packages/install-engine/src/__tests__/intent.test.ts packages/install-engine/src/index.ts
git commit -m "feat(install-engine): resolve install inputs and remote auth"
```

### Task 4: Install-Plan Hashing And Validation

**Files:**

- Create `packages/install-engine/src/hash.ts`
- Create `packages/install-engine/src/validate-plan.ts`
- Create `packages/install-engine/src/__tests__/validate-plan.test.ts`
- Modify `packages/install-engine/src/types.ts`
- Modify `packages/install-engine/src/index.ts`

**Interfaces:**

- Consumes `ResolvedInstallIntent` from Task 3.
- Produces `type AdapterCapability = "native-add-stdio" | "native-add-remote" | "native-remove" | "native-list" | "native-list-json" | "native-scope-user" | "native-scope-project" | "native-scope-global" | "env-reference" | "persisted-secret" | "cursor-deeplink"`.
- Produces `type ClientCommandOperation = { readonly type: "client-command"; readonly executable: string; readonly args: readonly string[]; readonly capability: AdapterCapability }`.
- Produces `type ConfigWriteOperation = { readonly type: "config-write"; readonly path: string; readonly mutationKey: string; readonly document: unknown }`.
- Produces `type ConfigRemoveOperation = { readonly type: "config-remove"; readonly path: string; readonly mutationKey: string }`.
- Produces `type DeeplinkOperation = { readonly type: "deeplink"; readonly url: string }`.
- Produces `type InstallOperation = ClientCommandOperation | ConfigWriteOperation | ConfigRemoveOperation | DeeplinkOperation`.
- Produces `interface InstallPlan { readonly schemaVersion: 1; readonly serverSlug: string; readonly client: ClientId; readonly scope: ClientScope; readonly variantId: string; readonly manifestHash: string; readonly intentHash: string; readonly operations: readonly InstallOperation[]; readonly previewLines: readonly string[]; }`.
- Produces `interface AdapterSafetyDescriptor { readonly client: ClientId; readonly executableAllowList: readonly string[]; readonly configRoots: readonly string[]; readonly deeplinkPrefixes: readonly string[]; readonly supportedCapabilities: readonly AdapterCapability[]; }`.
- Produces `function serializeInstallPlan(plan: InstallPlan): string`, `function hashInstallManifest(manifest: InstallManifestV1): string`, and `function validateInstallPlan(plan: InstallPlan, descriptor: AdapterSafetyDescriptor): InstallPlan`.

- [ ] Write `packages/install-engine/src/__tests__/validate-plan.test.ts` to reject unapproved executables, unsupported capabilities, out-of-root config writes, invalid deeplinks, and non-deterministic serialisation.
- [ ] Implement canonical serialisation and SHA-256 hashing for manifests and plans so receipts and dry-run comparisons are stable.
- [ ] Implement validation that rejects any plan shape outside the approved operation union before rendering and before execution.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/install-engine exec vitest run src/__tests__/validate-plan.test.ts
pnpm --filter @themcpdirectory/install-engine typecheck
```

- [ ] Commit:

```bash
git add packages/install-engine/src/hash.ts packages/install-engine/src/validate-plan.ts packages/install-engine/src/types.ts packages/install-engine/src/__tests__/validate-plan.test.ts packages/install-engine/src/index.ts
git commit -m "feat(install-engine): validate and hash install plans"
```

### Task 5: Adapter Runtime And Registry Contracts

**Files:**

- Create `packages/client-adapters/src/types.ts`
- Create `packages/client-adapters/src/runtime.ts`
- Create `packages/client-adapters/src/registry.ts`
- Create `packages/client-adapters/src/__tests__/registry.test.ts`
- Create `packages/test-utils/src/fake-process-runtime.ts`
- Modify `packages/test-utils/src/index.ts`
- Modify `packages/client-adapters/src/index.ts`
- Modify `packages/client-adapters/package.json`

**Interfaces:**

- Consumes `AdapterCapability`, `InstallPlan`, `AdapterSafetyDescriptor`, `ResolvedInstallIntent`, and `ValidatedInstallInputMap` from Tasks 3-4.
- Produces `interface ExecResult { readonly exitCode: number; readonly stdout: string; readonly stderr: string; }`.
- Produces `interface AdapterRuntime { readonly platform: NodeJS.Platform; readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly homeDirectory: string; execFile(command: string, args: readonly string[], options: { readonly timeoutMs: number; readonly maxStdoutBytes: number; readonly maxStderrBytes: number; readonly shell: false }): Promise<ExecResult>; readFile(path: string): Promise<string>; writeFile(path: string, content: string): Promise<void>; rename(from: string, to: string): Promise<void>; mkdir(path: string): Promise<void>; lstat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }>; stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }>; realpath(path: string): Promise<string>; unlink(path: string): Promise<void>; openUrl(url: string): Promise<void>; }`.
- Produces `interface ClientDetection { readonly id: ClientId; readonly installed: boolean; readonly executable?: string; readonly version?: string; readonly capabilities: readonly AdapterCapability[]; }`.
- Produces `interface InstalledMcpServer { readonly name: string; readonly slug?: string; readonly client: ClientId; readonly scope: ClientScope; readonly transport: "stdio" | "streamable-http" | "http"; readonly managedBy: "mcpdir" | "external"; readonly variantId?: string; readonly manifestHash?: string; readonly adapterMetadata: Readonly<Record<string, string | number | boolean>>; }`.
- Produces `interface PlanInstallOptions { readonly intent: ResolvedInstallIntent; readonly inputs: ValidatedInstallInputMap; readonly noninteractive: boolean; }`.
- Produces `interface PlanRemoveOptions { readonly slug: string; readonly scope?: ClientScope; }`.
- Produces `interface InstallVerificationResult { readonly ok: boolean; readonly installedEntry?: InstalledMcpServer; readonly message: string; }`.
- Produces `interface RemoveVerificationResult { readonly ok: boolean; readonly message: string; }`.
- Produces `interface DiagnosticIssue { readonly severity: "info" | "warning" | "error"; readonly code: string; readonly message: string; readonly recoveryHint?: string; }`.
- Produces `interface DiagnosticResult { readonly client: ClientId; readonly ok: boolean; readonly issues: readonly DiagnosticIssue[]; }`.
- Produces `interface McpClientAdapter { readonly id: ClientId; detect(): Promise<ClientDetection>; inspect(): Promise<readonly InstalledMcpServer[]>; planInstall(options: PlanInstallOptions): Promise<InstallPlan>; executePlan(plan: InstallPlan): Promise<void>; verifyInstall(plan: InstallPlan): Promise<InstallVerificationResult>; planRemove(options: PlanRemoveOptions): Promise<InstallPlan>; executeRemove(plan: InstallPlan): Promise<void>; verifyRemove(plan: InstallPlan): Promise<RemoveVerificationResult>; diagnose(): Promise<DiagnosticResult>; getSafetyDescriptor(): AdapterSafetyDescriptor; }`.
- Produces `interface AdapterRegistry { list(): readonly McpClientAdapter[]; get(id: ClientId): McpClientAdapter; detectAll(): Promise<readonly ClientDetection[]>; }`.
- Produces `interface FakeProcessRuntime { readonly runtime: AdapterRuntime; readonly spawnCalls: Array<{ readonly executable: string; readonly args: readonly string[] }>; readonly openCalls: string[]; readonly fileWrites: Array<{ readonly path: string; readonly content: string }>; }`.
- Produces `function createFakeProcessRuntime(): FakeProcessRuntime`.

- [ ] Write `packages/client-adapters/src/__tests__/registry.test.ts` to prove stable adapter order, registry lookup, injected runtime usage, and fake runtime call capture.
- [ ] Implement the runtime contract once and use it everywhere so later tests can assert exact executable and argument arrays with `shell: false`.
- [ ] Implement `createFakeProcessRuntime()` in `packages/test-utils` so later adapter and CLI integration tests can run in process without child-process guesswork.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/client-adapters exec vitest run src/__tests__/registry.test.ts
pnpm --filter @themcpdirectory/client-adapters typecheck
pnpm --filter @themcpdirectory/test-utils typecheck
```

- [ ] Commit:

```bash
git add packages/client-adapters/package.json packages/client-adapters/src/types.ts packages/client-adapters/src/runtime.ts packages/client-adapters/src/registry.ts packages/client-adapters/src/__tests__/registry.test.ts packages/client-adapters/src/index.ts packages/test-utils/src/fake-process-runtime.ts packages/test-utils/src/index.ts
git commit -m "feat(client-adapters): add shared runtime and registry contracts"
```

### Task 6: Codex Adapter

**Files:**

- Create `packages/client-adapters/src/codex.ts`
- Create `packages/client-adapters/src/__tests__/codex.test.ts`
- Modify `packages/client-adapters/src/index.ts`

**Interfaces:**

- Consumes `McpClientAdapter`, `AdapterRuntime`, `PlanInstallOptions`, `InstalledMcpServer`, and `AdapterCapability` from Task 5.
- Produces `interface CodexCapabilityProbeResult { readonly detection: ClientDetection; readonly helpText: Readonly<Record<"root" | "add" | "list" | "remove", string>>; }`.
- Produces `function detectCodex(runtime: AdapterRuntime): Promise<ClientDetection>`.
- Produces a `codexAdapter` that only emits install or remove operations for capabilities proven by current `codex` help output and version probes.

- [ ] Write `packages/client-adapters/src/__tests__/codex.test.ts` to prove exact `execFile` argument arrays, `shell: false`, capability-gated remote support, capability-gated JSON listing, env-reference propagation when supported, and clear unsupported failures when flags are not proven.
- [ ] Implement Codex detection using exact bounded probes such as `codex --version`, `codex mcp --help`, `codex mcp add --help`, `codex mcp list --help`, and `codex mcp remove --help`.
- [ ] Keep remote add, JSON list parsing, and env-reference writing behind verified capabilities only. If a command or flag is not proven, the adapter must return an unsupported error instead of guessing.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/client-adapters exec vitest run src/__tests__/codex.test.ts src/__tests__/registry.test.ts
pnpm --filter @themcpdirectory/client-adapters typecheck
```

- [ ] Commit:

```bash
git add packages/client-adapters/src/codex.ts packages/client-adapters/src/__tests__/codex.test.ts packages/client-adapters/src/index.ts
git commit -m "feat(client-adapters): add capability-gated codex adapter"
```

### Task 7: Claude Code Adapter

**Files:**

- Create `packages/client-adapters/src/claude-code.ts`
- Create `packages/client-adapters/src/__tests__/claude-code.test.ts`
- Modify `packages/client-adapters/src/index.ts`

**Interfaces:**

- Consumes `McpClientAdapter`, `AdapterRuntime`, and shared adapter contracts from Task 5.
- Produces `interface ClaudeCapabilityProbeResult { readonly detection: ClientDetection; readonly helpText: Readonly<Record<"root" | "add" | "list" | "remove", string>>; }`.
- Produces `function detectClaudeCode(runtime: AdapterRuntime): Promise<ClientDetection>`.
- Produces a `claudeCodeAdapter` that maps Directory scopes to the currently supported native Claude CLI scopes and rejects unsupported combinations clearly.

- [ ] Write `packages/client-adapters/src/__tests__/claude-code.test.ts` to cover exact command arrays, supported scope mapping, remove and inspect behaviour, env-reference propagation, and unsupported remote-auth combinations.
- [ ] Implement detection with exact bounded probes such as `claude --version`, `claude mcp --help`, `claude mcp add --help`, `claude mcp list --help`, and `claude mcp remove --help`.
- [ ] Keep any unverified remote or JSON flags capability-gated. If the installed Claude CLI cannot prove a feature, Phase E marks it unsupported instead of inferring hidden syntax.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/client-adapters exec vitest run src/__tests__/claude-code.test.ts src/__tests__/registry.test.ts
pnpm --filter @themcpdirectory/client-adapters typecheck
```

- [ ] Commit:

```bash
git add packages/client-adapters/src/claude-code.ts packages/client-adapters/src/__tests__/claude-code.test.ts packages/client-adapters/src/index.ts
git commit -m "feat(client-adapters): add capability-gated claude code adapter"
```

### Task 8: Cursor Adapter And Atomic Config Writes

**Files:**

- Create `packages/client-adapters/src/cursor-json.ts`
- Create `packages/client-adapters/src/cursor-deeplink.ts`
- Create `packages/client-adapters/src/cursor.ts`
- Create `packages/client-adapters/src/__tests__/cursor.test.ts`
- Modify `packages/client-adapters/src/index.ts`

**Interfaces:**

- Consumes the shared adapter contracts from Task 5 and install-plan types from Task 4.
- Produces `interface CursorConfigDocument { readonly mcpServers?: Readonly<Record<string, unknown>>; }`.
- Produces `interface CursorConfigMutation { readonly path: string; readonly backupPath: string; readonly tempPath: string; readonly scope: ClientScope; readonly serverKey: string; }`.
- Produces `function createCursorDeeplink(plan: InstallPlan): string`.
- Produces a `cursorAdapter` that prefers deeplinks when the operation can remain user-mediated and otherwise mutates `mcp.json` using read, parse, validate, backup, temp-write, fsync-where-supported, atomic-rename, and re-parse.

- [ ] Write `packages/client-adapters/src/__tests__/cursor.test.ts` to cover malformed JSON preservation, backup creation, temp-write plus atomic-rename, rollback on failed verification, symlink rejection, project and user scopes, env-reference handling, and deeplink validation.
- [ ] Implement Cursor JSON mutation helpers so they never overwrite malformed or symlink-redirected configuration and never write outside approved scope roots.
- [ ] Implement Cursor deeplink planning separately from JSON mutation so tests can prove the user-mediated path and the file-mutation path independently.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/client-adapters exec vitest run src/__tests__/cursor.test.ts src/__tests__/registry.test.ts
pnpm --filter @themcpdirectory/client-adapters typecheck
```

- [ ] Commit:

```bash
git add packages/client-adapters/src/cursor-json.ts packages/client-adapters/src/cursor-deeplink.ts packages/client-adapters/src/cursor.ts packages/client-adapters/src/__tests__/cursor.test.ts packages/client-adapters/src/index.ts
git commit -m "feat(client-adapters): add cursor adapter and atomic config writes"
```

### Task 9: CLI Runtime, Receipts, State Paths, And Built Binary Packaging

**Files:**

- Create `packages/cli/tsconfig.build.json`
- Create `packages/cli/src/config/runtime.ts`
- Create `packages/cli/src/config/state-paths.ts`
- Create `packages/cli/src/config/file-lock.ts`
- Create `packages/cli/src/config/receipt-store.ts`
- Create `packages/cli/src/output/redaction.ts`
- Create `packages/cli/src/__tests__/state-paths.test.ts`
- Create `packages/cli/src/__tests__/receipt-store.test.ts`
- Modify `packages/cli/package.json`

**Interfaces:**

- Produces `interface CliRuntimeConfig { readonly apiBaseUrl: string; readonly requestTimeoutMs: number; readonly stateDirOverride?: string; }`.
- Produces `interface CliStatePaths { readonly stateDir: string; readonly receiptsFile: string; readonly lockFile: string; readonly backupsDir: string; }`.
- Produces `function resolveCliStatePaths(options: { readonly platform: NodeJS.Platform; readonly env: NodeJS.ProcessEnv; readonly homeDirectory: string; readonly cwd: string; }): CliStatePaths`.
- Produces `interface InstallationReceipt { readonly schemaVersion: 1; readonly slug: string; readonly client: ClientId; readonly scope: ClientScope; readonly serverVersion: string; readonly variantId: string; readonly manifestHash: string; readonly installedAt: string; readonly adapterFingerprint: string; }`.
- Produces `interface ReceiptStore { list(): Promise<readonly InstallationReceipt[]>; write(receipt: InstallationReceipt): Promise<void>; remove(key: { readonly slug: string; readonly client: ClientId; readonly scope: ClientScope; }): Promise<void>; find(key: { readonly slug: string; readonly client: ClientId; readonly scope: ClientScope; }): Promise<InstallationReceipt | null>; }`.

- [ ] Write `packages/cli/src/__tests__/state-paths.test.ts` and `packages/cli/src/__tests__/receipt-store.test.ts` to cover macOS, Linux, and Windows path resolution, the exact `resolveCliStatePaths` signature, atomic receipt writes, corrupt-state preservation, and targeted removal.
- [ ] Implement runtime parsing, state-path resolution, redaction helpers, and receipt storage with lock-protected atomic writes and zero secret persistence.
- [ ] Add built-binary packaging to `packages/cli/package.json` and `packages/cli/tsconfig.build.json` so the package builds `dist/index.js` and exposes `bin: { "mcpdir": "./dist/index.js" }`. Do not add tarball or publish steps in Phase E.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/cli exec vitest run src/__tests__/state-paths.test.ts src/__tests__/receipt-store.test.ts
pnpm --filter @themcpdirectory/cli build
pnpm --filter @themcpdirectory/cli exec mcpdir --help
pnpm --filter @themcpdirectory/cli typecheck
```

- [ ] Commit:

```bash
git add packages/cli/package.json packages/cli/tsconfig.build.json packages/cli/src/config/runtime.ts packages/cli/src/config/state-paths.ts packages/cli/src/config/file-lock.ts packages/cli/src/config/receipt-store.ts packages/cli/src/output/redaction.ts packages/cli/src/__tests__/state-paths.test.ts packages/cli/src/__tests__/receipt-store.test.ts
git commit -m "feat(cli): add runtime state and built binary packaging"
```

### Task 10: Command Runner Plus `search` And `info`

**Files:**

- Create `packages/cli/src/dependencies.ts`
- Create `packages/cli/src/commands/result.ts`
- Create `packages/cli/src/output/render.ts`
- Create `packages/cli/src/output/json.ts`
- Create `packages/cli/src/commands/search.ts`
- Create `packages/cli/src/commands/info.ts`
- Create `packages/cli/src/__tests__/search-info.test.ts`
- Modify `packages/cli/src/index.ts`
- Modify `packages/cli/src/cli.ts`

**Interfaces:**

- Produces `interface PromptIO { readonly isInteractive: boolean; select<T extends string>(message: string, options: readonly T[]): Promise<T>; input(message: string): Promise<string>; confirm(message: string): Promise<boolean>; }`.
- Produces `interface OutputWriter { writeStdout(line: string): void; writeStderr(line: string): void; }`.
- Produces `interface CliDependencies { readonly directoryClient: DirectoryClient; readonly adapterRegistry: AdapterRegistry; readonly receiptStore: ReceiptStore; readonly promptIO: PromptIO; readonly output: OutputWriter; readonly runtime: CliRuntimeConfig; readonly clock: () => Date; }`.
- Produces `interface JsonEnvelopeV1<T = unknown> { readonly schemaVersion: 1; readonly command: string; readonly ok: boolean; readonly data?: T; readonly error?: { readonly code: string; readonly message: string; }; readonly warnings: readonly string[]; }`.
- Produces `interface CommandResult<T = unknown> { readonly exitCode: number; readonly stdout?: JsonEnvelopeV1<T>; readonly stderrLines: readonly string[]; readonly warnings: readonly string[]; }`.
- Produces `function runSearchCommand(argv: readonly string[], deps: CliDependencies): Promise<CommandResult>`.
- Produces `function runInfoCommand(argv: readonly string[], deps: CliDependencies): Promise<CommandResult>`.
- Produces `function runCli(argv: readonly string[], deps: CliDependencies): Promise<number>`.

- [ ] Write `packages/cli/src/__tests__/search-info.test.ts` to prove that `search` and `info` use the exact Phase D `data` and `meta` envelopes, that handlers return `CommandResult` instead of raw exit codes or ad hoc payloads, and that JSON output remains schema-versioned.
- [ ] Implement `runCli` as the only stdout, stderr, and exit-code writer. Individual command handlers must return `CommandResult` only.
- [ ] Implement `search` and `info` using the validated `DirectoryClient`, consistent output rendering, and machine-safe `--json` serialisation.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/cli exec vitest run src/__tests__/search-info.test.ts
pnpm --filter @themcpdirectory/cli typecheck
```

- [ ] Commit:

```bash
git add packages/cli/src/dependencies.ts packages/cli/src/commands/result.ts packages/cli/src/output/render.ts packages/cli/src/output/json.ts packages/cli/src/commands/search.ts packages/cli/src/commands/info.ts packages/cli/src/__tests__/search-info.test.ts packages/cli/src/index.ts packages/cli/src/cli.ts
git commit -m "feat(cli): add command runner search and info"
```

### Task 11: `add` Planning, Prompting, And Dry-Run

**Files:**

- Create `packages/cli/src/prompts/types.ts`
- Create `packages/cli/src/prompts/select-clients.ts`
- Create `packages/cli/src/prompts/select-variant.ts`
- Create `packages/cli/src/prompts/collect-inputs.ts`
- Create `packages/cli/src/prompts/confirm.ts`
- Create `packages/cli/src/commands/add-plan.ts`
- Create `packages/cli/src/__tests__/add-planning.test.ts`

**Interfaces:**

- Consumes `DirectoryClient`, `AdapterRegistry`, `ResolvedInstallIntent`, `InstallPlan`, `ClientDetection`, `PromptIO`, and `CommandResult`.
- Produces `interface AddCommandOptions { readonly identifier: string; readonly targetClients?: readonly ClientId[] | "all"; readonly requestedScope?: ClientScope; readonly requestedVariantId?: string; readonly dryRun: boolean; readonly yes: boolean; readonly json: boolean; }`.
- Produces `interface TargetInstallPreview { readonly client: ClientId; readonly scope: ClientScope; readonly detection: ClientDetection; readonly intent: ResolvedInstallIntent; readonly plan: InstallPlan; readonly warnings: readonly string[]; readonly inputSummary: readonly string[]; readonly unsupportedReason?: string; }`.
- Produces `interface AddPlanningResult { readonly previews: readonly TargetInstallPreview[]; readonly confirmationMessage: string; readonly blockedReason?: string; }`.
- Produces `function planAddCommand(options: AddCommandOptions, deps: CliDependencies): Promise<CommandResult<AddPlanningResult>>`.

- [ ] Write `packages/cli/src/__tests__/add-planning.test.ts` to cover `mcpdir add <slug>`, `mcpdir add <alias>`, `--to codex,cursor`, `--to all`, `--dry-run`, interactive `All detected clients`, noninteractive missing-input failure, and unsupported capability-gated remote variants.
- [ ] Implement `add` planning so all target plans are built and validated before any mutation, dry runs perform no write or spawn, and unverified client flags remain unsupported rather than guessed.
- [ ] Implement input collection so env references are preferred, explicit persisted-secret consent is interactive only, and noninteractive runs fail with a stable required-input error when consent or data is missing.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/cli exec vitest run src/__tests__/add-planning.test.ts
pnpm --filter @themcpdirectory/cli typecheck
```

- [ ] Commit:

```bash
git add packages/cli/src/prompts/types.ts packages/cli/src/prompts/select-clients.ts packages/cli/src/prompts/select-variant.ts packages/cli/src/prompts/collect-inputs.ts packages/cli/src/prompts/confirm.ts packages/cli/src/commands/add-plan.ts packages/cli/src/__tests__/add-planning.test.ts
git commit -m "feat(cli): add install planning prompts and dry run"
```

### Task 12: `add` Execution, Verification, Receipts, And Partial-Failure Recovery

**Files:**

- Create `packages/cli/src/commands/add-execute.ts`
- Create `packages/cli/src/__tests__/add-execution.test.ts`

**Interfaces:**

- Consumes `TargetInstallPreview`, `ReceiptStore`, and adapter execution and verification contracts.
- Produces `interface TargetInstallResultV1 { readonly client: ClientId; readonly scope: ClientScope; readonly status: "installed" | "failed" | "skipped"; readonly verificationMessage: string; readonly receiptWritten: boolean; readonly recoveryHint: string; }`.
- Produces `interface AddExecutionResult { readonly exitCode: number; readonly targets: readonly TargetInstallResultV1[]; }`.
- Produces `function deriveRecoveryHint(preview: TargetInstallPreview, result: TargetInstallResultV1): string`.
- Produces `function executeAddCommand(previews: readonly TargetInstallPreview[], deps: CliDependencies): Promise<CommandResult<AddExecutionResult>>`.

- [ ] Write `packages/cli/src/__tests__/add-execution.test.ts` to cover sequential execution after shared preflight, post-install verification, receipt persistence only after verification, stop-on-failure semantics, untouched later targets, and derived recovery hints that reference the real slug, client, and scope.
- [ ] Implement execution so already-verified targets keep their receipts, failed targets return a non-zero result, and recovery hints are derived from the preview data rather than hardcoded examples.
- [ ] Ensure `mcpdir add` never reports full success after a partial installation and always returns per-target status in human and JSON output.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/cli exec vitest run src/__tests__/add-execution.test.ts
pnpm --filter @themcpdirectory/cli typecheck
```

- [ ] Commit:

```bash
git add packages/cli/src/commands/add-execute.ts packages/cli/src/__tests__/add-execution.test.ts
git commit -m "feat(cli): add install execution and recovery handling"
```

### Task 13: `list` And `remove`

**Files:**

- Create `packages/cli/src/commands/list.ts`
- Create `packages/cli/src/commands/remove.ts`
- Modify `packages/cli/src/cli.ts`
- Create `packages/cli/src/__tests__/list-remove.test.ts`

**Interfaces:**

- Consumes adapter inspection, receipt storage, and install-plan validation from earlier tasks.
- Produces `interface ListCommandEntry { readonly name: string; readonly slug?: string; readonly client: ClientId; readonly scope: ClientScope; readonly transport: "stdio" | "streamable-http" | "http"; readonly managedBy: "mcpdir" | "external"; readonly variantId?: string; readonly manifestHash?: string; }`.
- Produces `interface RemoveCommandOptions { readonly slug: string; readonly targetClient?: ClientId; readonly scope?: ClientScope; readonly yes: boolean; readonly dryRun: boolean; readonly json: boolean; }`.
- Keeps `interface RemovalTargetSummary { readonly client: ClientId; readonly scope: ClientScope; readonly managedBy: "mcpdir" | "external"; readonly receiptFound: boolean; }` internal to `packages/cli/src/commands/remove.ts` for deterministic target discovery and ambiguity reporting.
- Keeps `interface RemovalPreview { readonly client: ClientId; readonly scope: ClientScope; readonly plan: InstallPlan; readonly receiptFound: boolean; }` internal to `packages/cli/src/commands/remove.ts` for planning and confirmation only.
- Produces `interface RemovalResult { readonly slug: string; readonly client: ClientId; readonly scope: ClientScope; readonly status: "removed" | "failed" | "skipped"; readonly executionMessage: string; readonly verificationMessage: string; readonly receiptFound: boolean; readonly receiptRemoved: boolean; }`.
- Produces `interface RemovalAmbiguityResult { readonly slug: string; readonly status: "ambiguous"; readonly availableTargets: readonly RemovalTargetSummary[]; readonly message: string; }`.
- Produces `interface RemovalNotInstalledResult { readonly slug: string; readonly status: "not_installed"; readonly availableTargets: readonly []; readonly message: string; }`.
- Produces `function runListCommand(argv: readonly string[], deps: CliDependencies): Promise<CommandResult<readonly ListCommandEntry[]>>`.
- Produces `function runRemoveCommand(options: RemoveCommandOptions, deps: CliDependencies): Promise<CommandResult<RemovalResult | RemovalAmbiguityResult | RemovalNotInstalledResult>>`.

- [ ] Write `packages/cli/src/__tests__/list-remove.test.ts` to cover external install discovery, Directory-managed labelling, bare `mcpdir remove <slug>` success when exactly one installed target matches, structured ambiguity with available targets when more than one installed target matches, structured not-installed output when zero targets match, explicit `--to` override, remove-plan confirmation, removal-result reporting, absence verification, and receipt deletion only after successful verification.
- [ ] Implement `list` by merging adapter inspection with receipts and marking entries as `mcpdir` or external.
- [ ] Implement `remove` so `--to` remains an explicit override, omitted `--to` performs deterministic receipt-backed target discovery, exactly one resolved target proceeds to plan and confirmation, more than one target returns a structured ambiguity result with available targets, zero targets returns a structured not-installed result, and successful execution still verifies absence before removing the matching receipt.
- [ ] Update the command parser and help output in `packages/cli/src/cli.ts` so the documented form is `mcpdir remove <slug> [--to <client>]`, and keep the JSON result surfaces for ambiguity and not-installed cases machine-readable.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/cli exec vitest run src/__tests__/list-remove.test.ts
pnpm --filter @themcpdirectory/cli typecheck
```

- [ ] Commit:

```bash
git add packages/cli/src/commands/list.ts packages/cli/src/commands/remove.ts packages/cli/src/__tests__/list-remove.test.ts
git commit -m "feat(cli): add list and remove commands"
```

### Task 14: `update`

**Files:**

- Create `packages/cli/src/commands/update.ts`
- Create `packages/cli/src/__tests__/update.test.ts`

**Interfaces:**

- Consumes `InstallationReceipt`, `DirectoryClient`, `planAddCommand`, and `executeAddCommand` from earlier tasks.
- Produces `interface UpdateCandidate { readonly receipt: InstallationReceipt; readonly latestServerVersion: string; readonly latestManifestHash: string; readonly diffLines: readonly string[]; readonly preview: TargetInstallPreview; }`.
- Produces `interface UpdateCommandOptions { readonly identifier?: string; readonly targetClients?: readonly ClientId[]; readonly yes: boolean; readonly dryRun: boolean; readonly json: boolean; }`.
- Produces `interface UpdateResult { readonly exitCode: number; readonly updated: readonly TargetInstallResultV1[]; readonly skipped: readonly string[]; }`.
- Produces `function runUpdateCommand(options: UpdateCommandOptions, deps: CliDependencies): Promise<CommandResult<UpdateResult>>`.

- [ ] Write `packages/cli/src/__tests__/update.test.ts` to cover receipt refresh, optional server-identifier filtering for `mcpdir update <server>`, exact-version and manifest diff calculation, confirmation before execution, `--dry-run`, partial update failures, and refusal to update externally discovered entries automatically.
- [ ] Implement `update` in two phases inside one command: first compute and render diffs for every receipt-backed candidate matching the optional identifier filter, then execute only after confirmation.
- [ ] Reuse the exact semver parsing rules from Task 2 when comparing current and latest versions so prerelease and build metadata remain valid exact versions.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/cli exec vitest run src/__tests__/update.test.ts
pnpm --filter @themcpdirectory/cli typecheck
```

- [ ] Commit:

```bash
git add packages/cli/src/commands/update.ts packages/cli/src/__tests__/update.test.ts
git commit -m "feat(cli): add update command"
```

### Task 15: `doctor`

**Files:**

- Create `packages/cli/src/commands/doctor.ts`
- Create `packages/cli/src/__tests__/doctor.test.ts`

**Interfaces:**

- Consumes `InstallationReceipt`, `DirectoryClient`, `AdapterRegistry`, and receipt-backed install metadata from earlier tasks.
- Produces `interface DoctorCheckResult { readonly name: string; readonly status: "ok" | "warning" | "error"; readonly message: string; readonly recoveryHint?: string; }`.
- Produces `interface DoctorReport { readonly exitCode: number; readonly checks: readonly DoctorCheckResult[]; }`.
- Produces `function runDoctorCommand(argv: readonly string[], deps: CliDependencies): Promise<CommandResult<DoctorReport>>`.

- [ ] Write `packages/cli/src/__tests__/doctor.test.ts` to cover API connectivity, detected clients, config syntax, expected entry presence, missing env references, package availability, version drift, upstream deletion, known Directory warnings, and the guarantee that `doctor` never executes arbitrary stdio packages.
- [ ] Implement `doctor` by re-resolving receipts, inspecting adapter state, checking declared env references by name, and deriving warnings from fresh manifests and stored receipts instead of hardcoded slug-specific logic.
- [ ] Keep every check read-only. `doctor` must not spawn upstream server packages or mutate client configuration.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/cli exec vitest run src/__tests__/doctor.test.ts
pnpm --filter @themcpdirectory/cli typecheck
```

- [ ] Commit:

```bash
git add packages/cli/src/commands/doctor.ts packages/cli/src/__tests__/doctor.test.ts
git commit -m "feat(cli): add doctor command"
```

### Task 16: In-Process Integration, Built-Binary Smoke, And Documentation

**Files:**

- Create `packages/test-utils/src/cli-harness.ts`
- Modify `packages/test-utils/src/index.ts`
- Create `packages/cli/src/__tests__/integration-cli.test.ts`
- Create `packages/cli/src/__tests__/binary-smoke.test.ts`
- Modify `README.md`
- Modify `docs/development.md`

**Interfaces:**

- Produces `interface InProcessCliHarness { readonly deps: CliDependencies; readonly stdout: string[]; readonly stderr: string[]; }`.
- Produces `function createInProcessCliHarness(overrides?: Partial<CliDependencies>): InProcessCliHarness`.

- [ ] Write `packages/cli/src/__tests__/integration-cli.test.ts` to run `runCli` in process with injected directory-client, adapter, receipt-store, and prompt dependencies for `search`, `info`, `add`, `list`, `remove`, `update`, and `doctor` behaviour tests.
- [ ] Write `packages/cli/src/__tests__/binary-smoke.test.ts` to build `packages/cli/dist/index.js` and verify only stdout, stderr, and exit code from a child-process `mcpdir --help` smoke run through the package bin contract. Do not use child-process tests to assert injected adapter spawn calls.
- [ ] Update `README.md` and `docs/development.md` with exact verification commands, safety guarantees, built-binary usage, and the fact that tarball publishing remains Phase H work.
- [ ] Run exact verification commands:

```bash
pnpm --filter @themcpdirectory/cli exec vitest run src/__tests__/integration-cli.test.ts src/__tests__/binary-smoke.test.ts
pnpm --filter @themcpdirectory/cli build
pnpm --filter @themcpdirectory/cli exec mcpdir --help
pnpm prettier --check README.md docs/development.md docs/superpowers/plans/2026-09-01-phase-e-cli-installation.md
```

- [ ] Commit:

```bash
git add packages/test-utils/src/cli-harness.ts packages/test-utils/src/index.ts packages/cli/src/__tests__/integration-cli.test.ts packages/cli/src/__tests__/binary-smoke.test.ts README.md docs/development.md
git commit -m "test(cli): add integrated cli coverage and docs"
```

## Self-Review

- Contract drift removed: Phase E now depends on the exact Phase D contract surface and no longer plans parallel schema definitions in `packages/api-contract`.
- API-root joining fixed: Task 1 makes `/api/v1` preservation an explicit transport invariant with focused tests.
- Unverified flags contained: Tasks 6 and 7 gate all unproven client commands and flags behind capability probes and clear unsupported paths.
- Remote auth defined: Task 3 gives exact env-reference, persisted-secret, and client-owned OAuth semantics; later tasks consume those types directly.
- Command-result consistency fixed: Task 10 introduces one `CommandResult` contract and makes `runCli` the only stdout, stderr, and exit-code writer.
- `update` and `doctor` split cleanly: Tasks 14 and 15 have distinct files, interfaces, and tests.
- End-to-end strategy corrected: Task 16 uses in-process dependency injection for behavioural coverage and keeps child-process testing to built-binary smoke only.
- Built binary added without overreaching release work: Task 9 adds the `mcpdir` build output and `bin` mapping to `dist/index.js`, while publish and tarball release remain Phase H work.
- Missing interfaces resolved: the plan now defines `DirectoryClientOptions`, `SearchServersParams`, `ValidatedInstallInputMap`, `AdapterRegistry`, `CliDependencies`, `TargetInstallPreview`, `TargetInstallResultV1`, and `createFakeProcessRuntime` explicitly.
- Exact-version parsing corrected: Task 2 replaces the narrow regex approach with semver parser semantics that accept prerelease and build metadata.
- Targeted update coverage added: Task 14 now traces and verifies both `mcpdir update` and `mcpdir update <server>`.
- Remove targeting corrected: Task 13 keeps `RemovalPreview` internal, supports bare `mcpdir remove <slug>` via deterministic receipt-backed target discovery, returns structured ambiguity or not-installed results when target resolution does not produce exactly one match, and keeps `--to` as an explicit override.
- Oversized work split: add planning and add execution are separate tasks, and `update` no longer shares a task with `doctor`.
- Recovery hints corrected: Task 12 derives recovery instructions from the real target metadata instead of hardcoded examples.
- Invalid verification globs removed: every verification command now uses exact package filters and exact test-file paths.
- Prerequisite and command traceability matrices added: the top of this plan now states the required Phase D baseline and maps each user-visible command to owning tasks and focused tests.
