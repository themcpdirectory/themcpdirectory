# Phase F Task 1 Report

## Status

- Completed

## Scope Implemented

- Added standalone canonical trust schemas in `packages/api-contract/src/public-api/trust.ts`.
- Added standalone canonical health schemas in `packages/api-contract/src/public-api/health.ts`.
- Extended existing public API server, install, parser, OpenAPI, and package exports surfaces additively.
- Preserved the existing Phase D `trustProfile` wire shape with `status`, `summary`, `checkedAt`, plus the existing booleans.
- Kept health `errorCode` and `errorSummary` out of the public contract.
- Did not add any aggregate trust score.

## Files

- `packages/api-contract/src/public-api/trust.ts`
- `packages/api-contract/src/public-api/health.ts`
- `packages/api-contract/src/public-api/servers.ts`
- `packages/api-contract/src/public-api/install.ts`
- `packages/api-contract/src/public-api/client-parsers.ts`
- `packages/api-contract/src/public-api/openapi.ts`
- `packages/api-contract/src/index.ts`
- `packages/api-contract/src/__tests__/servers-contract.test.ts`
- `packages/api-contract/src/__tests__/install-discovery-contract.test.ts`
- `packages/api-contract/src/__tests__/client-parsers.test.ts`
- `packages/api-contract/src/__tests__/openapi.test.ts`

## TDD Evidence

### Red phase

Command:

```bash
pnpm --dir /Users/timohaseloff/themcpdirectory/.worktrees/phases-d-h --filter @themcpdirectory/api-contract test -- src/__tests__/servers-contract.test.ts src/__tests__/install-discovery-contract.test.ts src/__tests__/client-parsers.test.ts src/__tests__/openapi.test.ts
```

Observed failures:

- Missing exported canonical schemas: `TrustSignalStateSchema`, `TrustProfileV1ClientSchema`, related trust and health surface.
- `installManifestResponseSchema` rejected additive `trustProfile`, `latestHealth`, and `installAvailability` fields.
- OpenAPI drift snapshot did not include the new additive contract coverage.

Notable local correction during red-to-green loop:

- The pre-existing test expecting `installManifestQuerySchema.parse({ client: "vscode" })` to throw was no longer correct for the current canonical client set. I preserved the shipped API behavior and updated that assertion instead of regressing `vscode` support.

### Green phase

Same focused command rerun after implementation:

```bash
pnpm --dir /Users/timohaseloff/themcpdirectory/.worktrees/phases-d-h --filter @themcpdirectory/api-contract test -- src/__tests__/servers-contract.test.ts src/__tests__/install-discovery-contract.test.ts src/__tests__/client-parsers.test.ts src/__tests__/openapi.test.ts
```

Result:

- `5` test files passed.
- `126` tests passed.

## Key Decisions

- Kept the legacy public `trustProfile` contract stable and additive by separating new standalone strict/tolerant canonical schemas from the existing detail wire shape.
- Added `latestHealth` and `installAvailability` only as optional public fields on existing detail and install envelopes so current producers are not forced to emit them before Task 7.
- Added summary-level `publisherVerified`, `latestHealthOutcome`, and `installAvailability` as optional fields on `serverSummaryServerSchema` and tolerant client parsers for the same compatibility reason.
- Registered the new contract concepts in OpenAPI indirectly through the existing response schemas instead of forcing standalone registry registration that was incompatible with the current zod-to-openapi usage in this repo.
- Kept health provenance public fields limited to `schemaVersion`, `outcome`, `checkedAt`, `durationMs`, `httpStatus`, `finalOrigin`, and `redirectCount`.

## Verification

Focused tests:

```bash
pnpm --dir /Users/timohaseloff/themcpdirectory/.worktrees/phases-d-h --filter @themcpdirectory/api-contract test -- src/__tests__/servers-contract.test.ts src/__tests__/install-discovery-contract.test.ts src/__tests__/client-parsers.test.ts src/__tests__/openapi.test.ts
```

Passed: `126/126`

Typecheck:

```bash
pnpm --dir /Users/timohaseloff/themcpdirectory/.worktrees/phases-d-h --filter @themcpdirectory/api-contract typecheck
```

Passed.

Lint:

```bash
pnpm --dir /Users/timohaseloff/themcpdirectory/.worktrees/phases-d-h --filter @themcpdirectory/api-contract lint
```

Passed.

Editor diagnostics:

- `get_errors` returned no errors for all touched `packages/api-contract` source and test files.

## Commit

- Commit: `c18710cba3dd134cf65ce7f6c8243427d31bb02b`
- Message: `feat(api-contract): extend trust and health schemas`

## Concerns

- Verification ran under Node `v26.5.0` while the package declares engine `>=24.10 <25`; commands passed, but the engine warning remained present throughout test, typecheck, and lint runs.
- The new standalone canonical schemas are exported and represented through existing OpenAPI response components, but they are not yet the mandatory producer shape for domain data. That remains intentionally deferred until the later projection tasks.

## Fix Round 1

### Files

- `packages/api-contract/src/public-api/trust.ts`
- `packages/api-contract/src/public-api/health.ts`
- `packages/api-contract/src/public-api/servers.ts`
- `packages/api-contract/src/public-api/install.ts`
- `packages/api-contract/src/public-api/openapi.ts`
- `packages/api-contract/src/index.ts`
- `packages/api-contract/src/__tests__/openapi.test.ts`

### Tests

- `pnpm --dir /Users/timohaseloff/themcpdirectory/.worktrees/phases-d-h --filter @themcpdirectory/api-contract test -- src/__tests__/servers-contract.test.ts src/__tests__/install-discovery-contract.test.ts src/__tests__/client-parsers.test.ts src/__tests__/openapi.test.ts` passed.
- `pnpm --dir /Users/timohaseloff/themcpdirectory/.worktrees/phases-d-h --filter @themcpdirectory/api-contract typecheck` passed.
- `pnpm --dir /Users/timohaseloff/themcpdirectory/.worktrees/phases-d-h --filter @themcpdirectory/api-contract lint` passed.

### Commit

- `fix(api-contract): register trust and health components`