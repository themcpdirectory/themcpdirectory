# Task 3 Review Fix Round 1 Report

Date: 2026-09-01

## Scope

Implemented only Registry client/security changes required by review findings:

1. Initial request URL pre-validation before first fetch with dedicated `unsafe_url` error kind.
2. Strict JSON media-type allowlist parsing (`application/json`, `application/*+json`, case-insensitive, optional parameters).
3. Removed `zod` from `packages/security` after confirming it is unused by current package code.

## Files Changed

- `packages/registry-client/src/client.ts`
- `packages/registry-client/src/__tests__/client.test.ts`
- `packages/security/package.json`
- `pnpm-lock.yaml`
- `.superpowers/sdd/2026-08-31-phase-a-c-foundation/task-3-fix-1-report.md`

## TDD Evidence

### RED (expected failing tests before implementation)

Command:

```bash
pnpm --filter @themcpdirectory/registry-client test
```

Result:

- `src/__tests__/client.test.ts` failed with 4 expected failures:
  - `accepts application/json and application/*+json media types`
  - `rejects JSON lookalike media types`
  - `validates initial URL before first fetch and blocks unsafe destinations`
  - `uses normalized initial URL returned by validateUrl`

### GREEN (minimal implementation + passing tests)

Command:

```bash
pnpm --filter @themcpdirectory/registry-client test
```

Result:

- `Test Files 2 passed (2)`
- `Tests 45 passed (45)`

## Implementation Details

### 1. Critical finding fix: initial URL validation before first fetch

- Added `unsafe_url` to `RegistryErrorKind`.
- In `OfficialRegistryClient.#fetchPage(...)`, validated initial computed URL with injected `validateUrl` before any network call.
- On blocked URL, throws `RegistryError` with kind `unsafe_url` and does not call `fetch`.
- Uses validator-returned normalized URL as the initial fetch URL.

Focused tests added:

- `validates initial URL before first fetch and blocks unsafe destinations`
- `uses normalized initial URL returned by validateUrl`

### 2. Important finding fix: strict content-type parsing/allowlist

- Replaced permissive substring check with strict parser helper:
  - Parses media type token before `;`
  - Case-insensitive compare
  - Accepts exact `application/json`
  - Accepts exact `application/*+json`
- Rejects lookalikes such as `application/jsonp` and `x-application/json`.

Focused tests added:

- `accepts application/json and application/*+json media types`
- `rejects JSON lookalike media types`

### 3. Minor finding fix: remove unused zod from security

- Confirmed no runtime/test usage under `packages/security/src`.
- Removed `zod` dependency from `packages/security/package.json`.
- Lockfile updated accordingly.

## Verification Commands and Results

1. Registry client focused tests

```bash
pnpm --filter @themcpdirectory/registry-client test
```

- PASS: `2` files, `45` tests.

2. Security focused tests (package touched)

```bash
pnpm --filter @themcpdirectory/security test
```

- PASS: `1` file, `54` tests.

3. Registry client lint/typecheck

```bash
pnpm --filter @themcpdirectory/registry-client lint
pnpm --filter @themcpdirectory/registry-client typecheck
```

- PASS

4. Security lint/typecheck (package touched)

```bash
pnpm --filter @themcpdirectory/security lint
pnpm --filter @themcpdirectory/security typecheck
```

- PASS

5. Quick diagnostics on touched files

```bash
get_errors for touched files
```

- No errors found.

## Public API / behavior compatibility check

- Preserved redirect validation, redirect loop/limit handling, and redirect URL validation.
- Preserved one timeout budget per attempt (same `AbortSignal` across redirect chain).
- Preserved retry policy and pagination behavior.
- Preserved public API shape; only added new error kind `unsafe_url` for correctly typed initial URL rejection.

## Self-review

- No weakening of existing security tests.
- Added focused tests for each requested finding.
- Implementation is minimal and localized.

## Commit

- Included in `fix(registry-client): validate initial URL and tighten JSON media-type checks`.

## Concerns

1. Workspace shows Node engine warnings (`>=24 <25` expected, local is `v26.5.0`). All required package tests/lint/typecheck still pass for this change set.
