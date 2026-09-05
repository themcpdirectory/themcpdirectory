# Phase H Task 4 Report

## Status

Completed.

## Implementation

- Added `/docs/api` using the shared release document model and `DocumentPage` renderer.
- Derived the exported `PUBLIC_API_DOC_ROUTES` from `createPublicApiOpenApiDocument()` and error entries from `apiErrorCodeSchema`.
- Normalized OpenAPI path parameters to the public `:parameter` route notation without duplicating route facts.
- Marked `/docs/api` available in the shared site route reference and updated its existing browser expectation atomically.
- Added the web app's direct workspace dependency on `@themcpdirectory/api-contract`.

## TDD Evidence

- Red: `docs-api.spec.ts` failed because `/docs/api` returned 404.
- Green: the focused API docs browser test passed after the route and contract-derived document were implemented.

## Verification

- API docs and route inventory browser tests: 2 passed.
- OpenAPI contract tests: 12 passed.
- `@themcpdirectory/api-contract` typecheck and lint: passed.
- `@themcpdirectory/web` typecheck and lint: passed.
- Focused Prettier check: passed.
- `git diff --check`: passed.
- Accessibility structure remains provided by the shared page shell: skip link target, one `h1`, labeled sections, semantic landmarks, keyboard-safe static content, forced-color-compatible tokens, and wrapping at narrow widths.

## Concerns

None.

## Fix Round 1

### Corrections

- Moved the complete public error status/message map into `@themcpdirectory/api-contract` and made the API error handler consume it.
- Added a typed documentation projection for success/error envelopes, pagination defaults and bounds, configuration-dependent rate limiting, a schema-validated example, listing statuses, upstream-deletion semantics, and install safety rules.
- Extended OpenAPI with the verified `ErrorResponse` schema, route-relevant error responses, `429 RATE_LIMITED` plus `Retry-After`, and both install-route `410` codes.
- Projected the shared contract facts visibly on `/docs/api`, including exact routes and errors, while sourcing listing statuses from `listingStatusSchema`.
- Strengthened only the existing OpenAPI/shared-contract tests and the single API docs browser test.

### TDD Evidence

- Red: the shared-contract test failed because the authoritative exports were absent; the OpenAPI test failed because `ErrorResponse` was absent; the docs browser test failed on incomplete visible error metadata.
- Green: the two focused contract files passed 19 tests, the API error/middleware files passed 9 tests, and the two docs browser files passed 2 tests.

### Verification

- Node `v24.20.0`.
- `@themcpdirectory/api-contract`, `@themcpdirectory/api`, and `@themcpdirectory/web` typechecks and lints passed.
- `git diff --check` passed before the final report update; final verification was repeated before commit.

### Concerns

None.

## Fix Round 2

### Corrections

- Added one exported `PUBLIC_API_RATE_LIMIT_RESPONSE` definition, including the `Retry-After` header name and schema facts, and made OpenAPI, public documentation metadata, and the API error handler consume it.
- Added exported install-safety constants beside the enforcing URL, package-version, and environment-reference schemas; the schemas and public documentation now consume the same values.
- Added a typed operation projection generated from OpenAPI and rendered every route/method with all path/query parameter constraints, complete response statuses, and the success schema name.
- Added concise collection, resolved-resource, and install-manifest examples parsed by their response schemas and rendered them visibly without publishing raw OpenAPI JSON.
- Strengthened the existing contract/OpenAPI tests, API error test, and single API docs browser test with exact response maps, shared-authority assertions, full envelope and safety facts, operation projections, and all three successful examples.

### TDD Evidence

- Red: focused contract tests failed on the missing shared rate-limit, safety, and success-example exports; the docs browser test failed on the missing shared header projection and operation sections.
- Green: focused contract tests passed 129 tests, API error/middleware tests passed 19 tests, and the API docs plus docs-routes browser tests passed 2 tests.

### Verification

- Node `v24.20.0`.
- `@themcpdirectory/api-contract`, `@themcpdirectory/api`, and `@themcpdirectory/web` typechecks and lints passed.
- Focused Prettier and `git diff --check` passed.

### Concerns

None.
