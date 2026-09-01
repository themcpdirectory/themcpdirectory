# Phase D Task 3 Report

## Scope
Implemented only Phase D Task 3 in `@themcpdirectory/api-contract`.

Delivered:
- strict install-manifest runtime contracts
- strict category, publisher, and client discovery contracts
- tolerant install-manifest client parsing with schema-version guardrails
- deterministic OpenAPI generation from the same runtime Zod schemas
- RED/GREEN tests covering schema examples and drift snapshots

Did not introduce:
- database imports
- app/runtime route imports
- Task 7 publisher-domain projections
- unsafe install-manifest execution fields such as `command`, `script`, or `expression`
- later-phase work

## Files Changed
- `packages/api-contract/src/index.ts`
- `packages/api-contract/src/public-api/client-parsers.ts`
- `packages/api-contract/src/public-api/install.ts`
- `packages/api-contract/src/public-api/discovery.ts`
- `packages/api-contract/src/public-api/openapi.ts`
- `packages/api-contract/src/__tests__/install-discovery-contract.test.ts`
- `packages/api-contract/src/__tests__/openapi.test.ts`

## Dependency Compatibility
Preflight dependency compatibility remained pinned to the already-verified Task 1 decision:
- `zod: 4.5.4`
- `@asteasolutions/zod-to-openapi: 9.1.0`
- verified peer compatibility already captured in `task-1-report.md` as `zod: ^4.0.0`

No dependency or lockfile changes were needed in Task 3.

## RED Phase
Added tests first:
- `packages/api-contract/src/__tests__/install-discovery-contract.test.ts`
- `packages/api-contract/src/__tests__/openapi.test.ts`

RED command:

```bash
pnpm --filter @themcpdirectory/api-contract test -- src/__tests__/install-discovery-contract.test.ts src/__tests__/openapi.test.ts
```

Observed RED failures before production changes:
- `parseInstallManifestResponse is not a function`
- `createPublicApiOpenApiDocument is not a function`
- `Cannot read properties of undefined (reading 'parse')` for missing install/discovery exports

This proved the missing Task 3 surfaces were not already implemented and that the tests were failing for the intended reason.

## GREEN Phase
Implemented:

### Strict runtime contracts
- `installManifestQuerySchema`
- `installManifestResponseSchema`
- `categoriesCollectionResponseSchema`
- `categoryDetailResponseSchema`
- `publisherDetailResponseSchema`
- `clientsCollectionResponseSchema`
- `clientDetailResponseSchema`

### Tolerant client parsing
- `parseInstallManifestResponse(input: unknown)`
- `UnsupportedManifestVersionError` fast-fail for non-v1 manifests
- additive-field tolerant install-manifest client mirrors kept inside `client-parsers.ts`

### Deterministic OpenAPI
- `createPublicApiOpenApiDocument(baseUrl: string)`
- OpenAPI document generated from the runtime Zod schemas, not handwritten JSON
- explicit path registration order locked to the approved Phase D sequence
- component schema refs stabilised with Zod metadata IDs so drift snapshots stay deterministic

## Example Evidence
Validated examples against the runtime schemas in `openapi.test.ts` and `install-discovery-contract.test.ts`:
- install manifest example with one `package` variant and one `remote` variant
- category detail example with strict category payload and server summaries
- publisher detail example with only `slug`, `name`, `verified`, and `websiteUrl`
- client detail example with the approved capability booleans

Additional contract guards proved:
- unsupported install schema versions throw `UnsupportedManifestVersionError`
- publisher detail rejects extra fields such as `description`
- install manifests reject undeclared executable fields on variants
- tolerant client parsing preserves additive fields on install responses

## Drift Snapshot Evidence
`openapi.test.ts` now does more than path-order assertions.

The deterministic drift snapshot locks:
- OpenAPI version `3.1.0`
- API info block
- server base URL
- exact ordered path inventory for 11 Phase D routes
- exact response component refs per route
- exact query-parameter inventory for search/install routes
- exact component schema key set

Locked schema keys in the snapshot:
- `CategoriesCollectionResponse`
- `CategoryDetailResponse`
- `ClientDetailResponse`
- `ClientsCollectionResponse`
- `InstallManifestResponse`
- `PublisherDetailResponse`
- `ResolvedServerResponse`
- `ServerCollectionResponse`
- `ServerDetailResponse`

This satisfies the preflight ruling that OpenAPI drift detection must cover schema-derived examples and deterministic snapshots, not just path ordering.

## Verification
Focused GREEN verification:

```bash
pnpm --filter @themcpdirectory/api-contract test -- src/__tests__/install-discovery-contract.test.ts src/__tests__/openapi.test.ts
```

Final focused result:
- `5` test files passed
- `19` tests passed

Package verification:

```bash
pnpm --filter @themcpdirectory/api-contract typecheck
pnpm --filter @themcpdirectory/api-contract lint
```

Observed final results:
- `typecheck`: PASS
- `lint`: PASS
- editor diagnostics on `packages/api-contract`: no errors found

Environment note:
- the workspace emitted a Node engine warning because the active shell is on Node `v26.5.0` while the package expects `>=24 <25`
- this warning did not block tests, lint, or typecheck

## Implementation Commit
Implementation commit:
- `60843212ed84454299d3795be171845bf170b52c`
- `feat(api-contract): add install and discovery contracts`

Commit file summary:
- `packages/api-contract/src/__tests__/install-discovery-contract.test.ts`
- `packages/api-contract/src/__tests__/openapi.test.ts`
- `packages/api-contract/src/index.ts`
- `packages/api-contract/src/public-api/client-parsers.ts`
- `packages/api-contract/src/public-api/discovery.ts`
- `packages/api-contract/src/public-api/install.ts`
- `packages/api-contract/src/public-api/openapi.ts`

`git show --stat --oneline --summary 6084321` reported:
- `7 files changed, 1219 insertions(+)`

## Self-Review
- The implementation stayed inside `packages/api-contract` and did not leak into DB or app layers.
- The publisher detail contract remained exact to the approved shape: `slug`, `name`, `verified`, `websiteUrl`.
- No Task 7 projection growth was introduced.
- The OpenAPI document is generated from runtime schemas, not duplicated route-local definitions.
- The tests now defend against the main Task 3 failure mode: schema drift passing CI unnoticed.
- No `any`, TODO markers, or debug logging were introduced.
- The only non-clean signal left after verification is the environment-level Node engine warning from the shell, not a package failure.