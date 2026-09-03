# SDD ledger — plan: docs/superpowers/plans/2026-09-01-phase-e-cli-installation.md

## Baseline

- Branch: `feature/phases-d-h`
- Phase D complete: `97806fa`
- Authority: `docs/superpowers/specs/2026-09-01-phase-e-cli-installation-design.md`
- Phase E status: Task 1 pending

## Task preflight

| Task | Status         | Finding / ruling                                                                             |
| ---- | -------------- | -------------------------------------------------------------------------------------------- |
| 1    | ready          | Use actual Phase D concrete response types; define `createFixtureDirectoryApiServer`.        |
| 2    | ready after 1  | Use maintained `semver` plus Phase D registry exactness; reject unsupported PyPI installs.   |
| 3    | ready after 2  | Define internal normalized input definitions; never infer OAuth without an explicit signal.  |
| 4    | ready after 3  | Hashes are explicit planner inputs; serialised intents/plans contain no secret values.       |
| 5    | ready after 4  | Runtime includes stdin, bounds, mode, fsync/backup primitives and structured rollback.       |
| 6    | ready after 5  | Expose or remove probe result; prove all bounded process options and safe discovery.         |
| 7    | ready after 5  | Same capability/runtime requirements as Task 6.                                              |
| 8    | complete       | Cursor covers mode, backup, fsync, concurrency, symlinks, rollback, and fixed scopes.       |
| 8A   | complete       | VS Code uses documented JSON shapes and portable workspace/user paths; no guessed CLI use.  |
| 9    | ready after 8  | Choose one shebang bin entry; build before smoke and invoke built output directly.           |
| 10   | ready after 9  | `CommandResult` carries data/human lines/category; only `runCli` writes; compose adapters.   |
| 11   | ready after 10 | Reusable planner separate from command wrapper; dry-run permits read-only probes only.       |
| 12   | complete       | Shared preflight, immediate revalidation, sequential execution, receipts, partial recovery.  |
| 13   | ready after 12 | Distinct `RemovalPlan`; CLI derives ownership; multi-scope target is structured ambiguity.   |
| 14   | ready after 13 | Render all diffs, confirm each plan; compare package version separately from server version. |
| 15   | ready after 14 | Non-secret env refs in diagnostics; metadata availability means fresh manifest availability. |
| 16   | ready after 15 | Build precedes binary smoke; cover exit categories, redaction, prompts, full add matrix.     |

## Interface preflight

| Tasks                     | Produced → consumed/shared surface                    | Result                                                                 |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| 1–5                       | `test-utils` barrel                                   | Serial write only.                                                     |
| 1→10/11/14/15/16          | Directory client/fake API → CLI flows                 | Normal after concrete-type ruling.                                     |
| 2→3/4/14                  | Semver/variant types → intent, plans, update          | Normal with maintained semver and registry policy.                     |
| 3→4/5/11/15               | Intent/input references → plan, adapters, CLI, doctor | Opaque references only; env metadata retained without values.          |
| 4→5/8/11/12/13/14         | Plan validation/hashes → adapters and commands        | Explicit hashes; pre-execution revalidation; separate removal type.    |
| 5→6/7/8/10/11/12/13/15/16 | Runtime/registry → adapters and CLI                   | Extend secure runtime; observed state contains no CLI ownership.       |
| 6/7/8→10                  | Concrete adapters → registry composition              | Compose explicitly in CLI dependencies.                                |
| 9→10/12/13/14/15/16       | State/bin/redaction → commands and smoke              | One bin entry; receipt schema stays secret-free.                       |
| 10→11/12/13/14/15/16      | Result/dispatcher → later commands/integration        | Handlers return data and lines; each completed command wires `cli.ts`. |
| 11→12/14                  | Add previews/planner → execute/update                 | Reusable domain functions, confirmation outside planner.               |
| 12→14                     | Add execution/results → update                        | Reuse executor internals, not command envelopes.                       |

## Rulings

- Ruling: Use actual `SupportedClientId` and concrete Phase D schemas; define Phase-E-only aliases in their owning package, never new public API schemas — prevents contract drift — wrong choice would require migration.
- Ruling: Use maintained `semver` for npm parsing and Phase D exactness policy; unsupported registries fail explicitly — preserves immutable install guarantees — wrong choice could reject valid prereleases or permit mutable versions.
- Ruling: Normalize manifest inputs internally and represent secrets only as execution-time opaque references; do not infer OAuth — preserves the no-secret-persistence boundary — wrong choice could leak credentials.
- Ruling: Compute manifest/intent hashes in planning and pass them explicitly; canonical serialisation excludes values — keeps receipts deterministic — wrong choice breaks drift detection.
- Ruling: Extend adapter runtime for bounded no-stdin execution, file modes, fsync, backups, and rollback; fakes capture options — required by the approved safety design — wrong choice risks unsafe mutation.
- Ruling: Adapter inspection reports observations/fingerprints; CLI joins receipts and assigns `managedBy` — ownership belongs to CLI state — wrong choice mislabels external installs.
- Ruling: Avoid product-package cycles in shared test utilities; keep typed package-specific harnesses with the consumer when necessary — keeps dependency graph acyclic — wrong choice blocks builds.
- Ruling: Dry-run may perform bounded read-only detection/help/version probes, but no mutation, package execution, URL opening, file/receipt write, or backup — capability gating requires observation — wrong choice makes safe planning impossible.
- Ruling: Use distinct install and removal plans; `--to` with multiple scopes remains ambiguous until `--scope` — avoids fabricated install metadata — wrong choice can remove the wrong target.
- Ruling: `CommandResult` carries domain data, human lines, warnings, and stable exit category; only `runCli` serialises/writes — enforces one output boundary — wrong choice creates divergent JSON/human behavior.
- Ruling: Update compares selected package version separately, renders all diffs, then confirms each plan unless `--yes` — follows the design authority — wrong choice obscures real upgrades.
- Ruling: Doctor checks fresh manifest metadata and non-secret env names only; no live package registry probe without a dedicated dependency — keeps doctor read-only and scoped — wrong choice introduces hidden network/runtime behavior.
- Ruling: Add VS Code after the three planned adapters as an official client using `.vscode/mcp.json` for project scope and `~/.copilot/mcp-config.json` for portable user scope; do not guess profile-specific paths or undocumented CLI flags — follows current official VS Code MCP configuration guidance — wrong choice may omit profile-local installations.
- Ruling: Keep adapter tests compact from Task 7 onward; use a few high-signal contract cases per adapter and defer the broad behavior matrix to Task 16 — preserves delivery speed while retaining focused safety checks — wrong choice may surface low-risk compatibility gaps later.

## Progress

- Task 1 implementation commit: `caf4bd7`
- Task 1 review: fix round 1 required.
  - Public package imports/dependencies missing.
  - Prefixed API roots are overwritten.
  - Parsed response envelopes lose `meta`.
  - Malformed/empty JSON is misclassified as HTTP failure.
  - Status tests hit fallback routes and do not assert stable codes; timeout/invalid JSON are uncovered.
  - Unsupported-version upgrade guidance is not asserted.
  - Lockfile contains the required importer plus unrelated resolver churn.
- Task 1 fix round 1 commit: `f20210c`.
- Task 1 re-review: `PASS`.
- Task 1: complete.
- Task 2 implementation commit: `fc8397c`.
- Task 2 review: fix round 1 required.
  - Reject `unknown` and absent compatibility; admit only explicit supported states.
  - Reject remote SSE until an adapter capability proves it.
  - `parseSemVer` must reject `v` prefixes and surrounding whitespace.
  - Ruling: the plan-fixed reason union remains unchanged; missing requested variants use `CLIENT_INCOMPATIBLE` plus `requestedVariantId` and a stable not-available message so downstream can distinguish stale selection from manifest-level incompatibility.
  - Remove unrelated web ESLint peer-resolution churn from the lockfile.
- Task 2 fix round 1 commit: `8c79cb0`.
- Task 2 re-review: `PASS`.
- Task 2: complete.
- Task 3 implementation commit: `876bc87`.
- Task 3 review: fix round 1 required.
  - Canonicalize `requiredEnvReferences` independently of caller object order.
  - Preserve mixed env-reference and persisted-secret auth per input key.
  - Reject explicit client OAuth consistently while Phase D has no OAuth signal; retain the planned follow-up union arm for future explicit metadata.
  - Accept portable mixed-case environment variable identifiers.
  - Replace the vacuous `JSON.stringify(Map)` assertion; test explicit entry projection, duplicate placeholders, key collisions, mixed auth, and ordering.
  - Enforce a manifest safety boundary for serializable remote headers/defaults; runtime values remain outside intents and errors.
- Task 3 fix round 1 commit: `4d9de12`.
- Task 3 re-review: fix round 2 required.
  - Sensitive header templates must be structurally limited to exactly one placeholder, optionally preceded by a known Authorization scheme; reject literal credential fragments.
  - Validated input objects must be copied and frozen so references returned by `get`/iteration cannot bypass validation.
  - Ruling: sensitive-name matching is defense-in-depth only; structural sensitive-header validation is authoritative. Future explicit secret metadata should replace heuristics when the public contract provides it.
- Task 3 fix round 2 commit: `bd3da27`.
- Task 3 re-review: fix round 3 required.
  - Non-sensitive templated headers are ordinary text inputs and must not participate in `remoteAuth`.
  - Header placeholder names use the portable identifier grammar and reject whitespace/multi-token forms.
- Task 3 fix round 3 commit: `6c82758`.
- Task 3 re-review: `PASS`.
- Task 3: complete.
- Task 4 implementation commit: `73a4e26`.
- Task 4 review: fix round 1 required.
  - Reject accessor-backed values before canonical serialisation reads properties.
  - Require absolute approved config roots and operation paths; reject unsupported UNC/device paths.
  - Validate Cursor install deeplinks structurally instead of by string prefix.
  - Provide distinct removal-plan serialisation and validation.
  - Enforce executable shape independently of adapter allowlists.
- Task 4 fix round 1 commit: `42f01f1`.
- Task 4 re-review: fix round 2 required.
  - Reject current-directory and other relative executable paths while preserving bare commands and absolute paths with spaces.
  - Enforce bidirectional Cursor client, capability, and deeplink-descriptor coupling.
  - Update downstream plan handoffs for typed deeplinks and distinct removal plans.
- Task 4 fix round 2 commit: `aa6196f`.
- Task 4 final verification: focused `14/14`; full install-engine `83/83`; typecheck, lint, Prettier, and diff checks passed.
- Task 4 final re-review: `PASS`.
- Task 4: complete.
- Task 5 implementation commit: `505c553`.
- Task 5 review: fix round 1 required.
  - Enforce `shell: false` and ignored stdin at the runtime boundary, not only in TypeScript types.
  - Bound fake execution output and timeout behavior so safety tests cannot pass only under the fake.
  - Align fake filesystem failures and symlink write behavior with the production runtime.
- Task 5 fix round 1 commit: `0c2bce7`.
- Task 5 re-review: fix round 2 required.
  - Move directory descendants when the fake runtime renames a directory.
  - Exercise forced output-limit settlement when a real child exits immediately.
  - Explicitly cover inherited-stdin rejection in both runtime implementations.
- Task 5 fix round 2 commit: `20c6ea2`.
- Task 5 final verification: focused registry `15/15`; full client-adapters `17/17`; test-utils `3/3`; typecheck, lint, Prettier, and diff checks passed.
- Task 5 final re-review: `Spec: PASS`; `Quality: PASS`.
- Task 5 residual risk: verification ran on Node `26.5.0`; repository support remains Node `>=24.10 <25` and requires a final Node 24 run.
- Task 5: complete.
- Task 6 implementation commits: `3611d12`, `6b19f6c`, `4072878`.
- Task 6 review: `Spec: PASS`; `Quality: PASS`, with removal-slug hardening and exact remote-preview follow-up.
- Task 6 final verification: focused Codex `14/14`; package TypeScript, ESLint, and diff checks passed.
- Task 6 residual risk: verification ran on Node `26.5.0`; repository support remains Node `>=24.10 <25` and requires a final Node 24 run.
- Task 6: complete.
- Task 7 implementation commit: `7a1f632`.
- Task 7 review: fix round 1 required.
  - Drop credential-bearing authentication detail values from inspection metadata.
  - Probe and gate exact remote `add-json` and header syntax.
  - Do not fabricate a requested scope when detail inspection fails.
- Task 7 fix round 1 commit: `e5c8b9b`.
- Task 7 re-review: one metadata-classification correction required; unknown authentication text must not imply configured authentication.
- Task 7 fix round 2 commit: `acdf642`.
- Task 7 final verification: focused Claude Code tests `8/8`; package TypeScript and ESLint passed before the final format-only/auth-classification commit; post-fix TypeScript and Prettier checks passed.
- Task 7 final re-review: `Spec: PASS`; `Quality: PASS`.
- Task 7 residual risk: verification ran on Node `26.5.0`; repository support remains Node `>=24.10 <25` and requires a final Node 24 run.
- Task 7: complete.
- Task 8 implementation commit: `ff68228`.
- Task 8 review: fix round 1 required.
  - Allocate collision-safe backup paths for repeated mutations and restore from the path actually selected.
  - Make removal a true no-op when the config or target entry is absent.
- Task 8 fix round 1 commit: `d87fd96`.
- Task 8 final verification: focused Cursor tests `7/7`; package TypeScript and ESLint passed; diff check passed.
- Task 8 final re-review: `Spec: PASS`; `Quality: PASS`.
- Task 8 residual risk: verification ran on Node `26.5.0`; repository support remains Node `>=24.10 <25` and requires a final Node 24 run.
- Task 8: complete.
- Task 8A implementation commit: `9d45c6f`.
- Task 8A review: `Spec: PASS`; fix round 1 required for quality.
  - Preserve prompt inputs still referenced by remaining server entries during removal.
  - Normalize inspected VS Code HTTP entries to `streamable-http`.
- Task 8A fix round 1 commit: `1580313`.
- Task 8A final verification: focused VS Code tests `5/5`; API contract `6/6`; catalogue plus VS Code `7/7`; package TypeScript, ESLint, and diff checks passed.
- Task 8A final re-review: `Spec: PASS`; `Quality: PASS`.
- Task 8A residual risk: verification ran on Node `26.5.0`; repository support remains Node `>=24.10 <25` and requires a final Node 24 run.
- Task 8A: complete.
- Task 9 implementation commit: `1c52555`.
- Task 9 review: fix round 1 required.
  - Serialize read-side state initialization and corrupt-state repair with receipt mutations.
  - Remove content-based secret heuristics that reject schema-valid metadata such as `secrets-manager`.
  - Validate the built entry directly because pnpm does not self-link a workspace package's own bin.
- Task 9 fix round 1 commit: `0869827`.
- Ruling: Task 9 validates `dist/index.js` by building and invoking it directly; the installed-package child-process smoke remains Task 16 because `pnpm --filter <package> exec <own-bin>` cannot resolve a package's uninstalled self-bin — wrong choice could defer a package-metadata defect until Task 16.
- Task 9 final verification: focused state/receipt tests `6/6`; build, direct built help, package TypeScript, ESLint, Prettier, and diff checks passed.
- Task 9 final re-review: `Spec: PASS`; `Quality: PASS`.
- Task 9 residual risk: verification ran on Node `26.5.0`; repository support remains Node `>=24.10 <25` and requires a final Node 24 run.
- Task 9: complete.
- Task 10 implementation commit: `e8721a8`.
- Task 10 final verification: focused search/info tests `5/5`; full CLI package `11/11`; package TypeScript and ESLint passed.
- Task 10 review: `Spec: PASS`; `Quality: PASS`.
- Task 10 advisory: keep future command error mapping centralized before it multiplies; preserve the compact test strategy instead of adding low-risk parser cases now.
- Task 10 residual risk: verification ran on Node `26.5.0`; repository support remains Node `>=24.10 <25` and requires a final Node 24 run.
- Task 10: complete.
- Task 11 implementation commit: `7a4596c`.
- Task 11 fix commits: `c2ce50e`, `3993c2e`, `d2c2f3b`.
- Task 11 final fix round:
  - Preserve omitted optional environment variables through collection and all four real adapters.
  - Emit VS Code sensitive environment references as `${env:NAME}` and do not advertise unsupported persisted-secret behavior.
  - Permit only bounded read-only version/help probes during dry-run; forbid writes and mutation-operation spawns.
  - Reject credential-like package arguments before any visible or secret prompt and require environment-variable declarations instead.
- Task 11 final verification: install-engine focused tests `26/26`; CLI planning `6/6`; four adapter suites `34/34`; TypeScript and ESLint passed for install-engine, CLI, and client-adapters; Prettier and diff checks passed.
- Task 11 final re-review: `Spec: PASS`; `Quality: PASS`.
- Task 11 residual risk: verification ran on Node `26.5.0`; repository support remains Node `>=24.10 <25` and requires a final Node 24 run.
- Task 11: complete.
- Task 12 implementation:
  - Preflight every adapter and plan before mutation, then revalidate each plan immediately before its own execution.
  - Execute targets sequentially, verify before receipt persistence, stop after the first failure, and retain every target in partial JSON and human output.
  - Distinguish verification failures from execution failures and issue retry-only recovery before mutation.
- Task 12 final verification: focused add execution `1/1`; CLI TypeScript and ESLint passed; editor diagnostics, Prettier, and diff checks passed.
- Task 12 final review: `Spec: PASS`; `Quality: PASS`.
- Task 12 residual risk: verification ran on Node `26.5.0`; repository support remains Node `>=24.10 <25` and requires a final Node 24 run.
- Task 12: complete.
