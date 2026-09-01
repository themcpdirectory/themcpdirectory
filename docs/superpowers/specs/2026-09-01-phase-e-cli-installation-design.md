# Phase E CLI And Installation Design

**Status:** Approved working design

**Date:** 2026-09-01

**Authorities:** `docs/ai-docs/engineering-spec.md` sections 46-63 and 90, plus `docs/ai-docs/product-and-technical-spec.md`

## Goal

Ship a cross-platform `mcpdir` CLI that resolves Directory listings, turns `InstallManifestV1` into a reviewable client-independent plan, and applies that plan through narrowly scoped client adapters without shell evaluation or secret persistence.

## Scope

Phase E implements `add`, `remove`, `search`, `info`, `list`, `update`, and `doctor`; Codex, Claude Code, and Cursor adapters; dry runs; confirmation and noninteractive behaviour; platform-appropriate local state; and installation receipts.

The release gate remains in Phase H. Phase E does not publish to npm, execute Registry-supplied scripts, become an OAuth intermediary for MCP servers, or add hidden configuration values.

## Ownership And Dependencies

`packages/directory-client` is a new transport package for the product API and validates every response with `packages/api-contract`. `packages/registry-client` remains exclusively responsible for Official MCP Registry ingestion.

`packages/install-engine` is pure and deterministic. It selects variants, validates required input references, emits a client-neutral `ResolvedInstallIntent`, and validates concrete plans against central safety policy. It performs no I/O and imports no concrete adapter.

`packages/client-adapters` owns detection, inspection, conversion of a resolved intent into concrete operations, execution, rollback, and diagnostics for each client. Only an adapter can choose an executable or approved configuration path.

`packages/cli` owns command parsing, prompts, rendering, API orchestration, exit codes, and receipt persistence.

```text
api-contract <- directory-client <- cli
api-contract <- install-engine <- client-adapters <- cli
```

## Install Plan Contract

A resolved intent is serialisable and contains server slug/version, target client, scope, selected pinned manifest variant, warnings, and required environment references. It contains no executable, filesystem path, deeplink, or concrete operation.

An adapter converts the intent into a serialisable install plan containing an ordered list of allowed operations. The install engine validates that plan before rendering and again before execution. Executables and paths must match fixed descriptors exported by the selected adapter; manifest fields cannot populate them.

Allowed operation variants are:

- `client-command`: a trusted adapter-owned executable plus separate argument array
- `config-write`: a validated JSON mutation at an adapter-approved path
- `config-remove`: removal of an adapter-owned entry at an approved path
- `deeplink`: a validated Cursor installation URL for user-mediated opening

There is no generic executable operation. `shell`, `script`, `eval`, `download-and-execute`, free-form command strings, and manifest-selected executables are impossible in the TypeScript union.

Plans have canonical JSON serialisation and a SHA-256 manifest hash for receipts and dry-run comparison. Dry-run output redacts values and performs no write, process spawn, browser open, receipt change, or backup creation.

## Add Flow

`mcpdir add <identifier>`:

1. validates CLI input, including one or more target clients
2. resolves the identifier through `/resolve`
3. fetches `InstallManifestV1`
4. detects clients and their capabilities
5. selects requested clients or prompts for one client or all compatible detected clients
6. selects a compatible variant deterministically or prompts when a meaningful choice remains
7. gathers non-secret configuration and references to existing environment variables
8. creates and validates every target's install plan before any mutation
9. displays all exact effects with secrets redacted
10. obtains confirmation unless `--yes` was supplied
11. executes target plans sequentially through their selected adapters
12. reinspects each changed client configuration
13. writes each receipt only after that target verifies successfully

`--to`, `--scope`, `--dry-run`, `--yes`, and machine-readable `--json` are supported where meaningful. Noninteractive mode fails with a stable exit code when a required choice or value is absent. It never invents a default that changes destination, scope, package variant, remote URL, header, or environment binding.

`--to codex,cursor` and `--to all` are first-class. All plans must pass preflight before execution and receive one explicit confirmation. Cross-client mutation cannot be truly atomic: on a target failure the CLI stops, preserves already verified installations and receipts, leaves unstarted targets untouched, and returns a non-zero per-target result with exact recovery/removal instructions. It never reports full success after a partial installation.

A listing marked as deleted upstream or an install endpoint returning `410` is blocked by default. No unsafe override is introduced in this phase.

## Secret Handling

The CLI accepts names of environment variables and verifies presence without printing values. Where a client supports environment references, it writes the reference. Where a client can only persist a value, the CLI must explain this before confirmation and require explicit interactive consent; the value is passed directly to the adapter and never written to receipts, logs, diagnostics, errors, analytics, or dry-run output.

Process environment snapshots are never serialised. Errors redact values using structured fields rather than regular-expression-only post-processing.

## Adapter Contract

Adapters implement the engineering specification's `McpClientAdapter` contract plus explicit capability and rollback results. All filesystem and process dependencies are injectable for tests.

Package variants must contain an exact immutable version. Adapters reject mutable tags, ranges, absent versions, malformed supplied integrity, and unsupported registry/runtime combinations even if an older API incorrectly emitted them. Runtime hints never choose executables.

Detection searches `PATH` and platform-standard locations without trusting current-directory executables or hardcoding a single path. Version probes use adapter-owned bounded arguments, `shell: false`, timeouts, output limits, and no inherited stdin.

### Codex

Codex uses the native `codex mcp` commands where supported. Stdio package arguments remain separate after `--`. Remote configuration uses the installed CLI's native capability. MCP OAuth remains Codex's responsibility; the CLI provides the follow-up instruction rather than intercepting credentials.

### Claude Code

Claude Code uses `claude mcp add/remove/list` and maps Directory scopes to capabilities reported by the installed CLI. It does not edit Claude configuration when the native CLI can perform the operation.

### Cursor

Cursor prefers a valid installation deeplink when the operation can remain user-mediated. The CLI otherwise mutates global or project `mcp.json` through this sequence: read, parse, schema-validate, create a same-directory backup, apply a key-scoped mutation, write a mode-preserving temporary file, fsync where supported, atomic rename, and parse again. Malformed or symlink-redirected configuration is not overwritten. Rollback restores the backup if post-write verification fails.

## Other Commands

`search` and `info` are read-only API views with text and JSON output.

`list` merges adapter inspection with receipts and labels entries as Directory-managed or externally discovered.

`remove` displays and confirms an adapter-generated removal plan, verifies absence, and removes only the matching receipt after success.

`update` checks current receipts against fresh manifests, displays version and manifest changes, and requires confirmation before each resulting plan. It never updates externally discovered entries automatically.

`doctor` checks API connectivity, client detection, configuration syntax, expected entries, required environment variable presence, package metadata availability, manifest drift, health warnings, and upstream deletion. It never starts an MCP server or package.

## Local State And Receipts

State uses an XDG-compliant directory on Linux, Application Support on macOS, and the appropriate application-data directory on Windows. The state schema is versioned and validated before use.

A receipt stores `schemaVersion: 1`, canonical slug, client, scope, server version, selected variant ID, manifest hash, installation timestamp, and a non-secret adapter fingerprint. Writes are lock-protected and atomic. Corrupt state is preserved for diagnosis rather than silently replaced.

No API keys, OAuth tokens, client secrets, raw environment values, full manifests, or arbitrary command output are stored.

## Errors, Output, And Exit Codes

Human output is concise and uses stderr for diagnostics. `--json` writes one schema-versioned JSON value to stdout and keeps stderr machine-safe.

Stable exit categories distinguish usage, network/API, ambiguity, unavailable installation, required input, user cancellation, client unavailable, unsafe configuration, execution failure, and verification failure. Stack traces require an explicit development flag and still redact secrets.

Prompts are keyboard operable, retain visible labels, do not rely on colour, and degrade to plain text when colour or interactivity is unavailable.

## Testing And Verification

Unit tests begin with malicious arguments, shell metacharacters, secret redaction, deterministic planning, variant compatibility, noninteractive failure, receipt corruption, and path traversal/symlink cases.

Adapter tests use fake executables and temporary homes on macOS, Linux, and Windows path semantics. They assert exact executable/argument arrays and `shell: false`. Cursor tests cover malformed JSON, backups, atomic replacement, rollback, permissions, concurrent writes, and project/global scopes.

CLI integration tests run against a fake HTTP server returning schema-valid and invalid API responses. End-to-end fixture tests exercise every command without touching real user configuration. Phase E's definition of done explicitly includes all six `mcpdir add` forms in engineering section 90.

The definition of done also includes the product contract's interactive “All detected clients”, `--to codex,cursor`, and `--to all` flows, including preflight rejection and partial-failure reporting. Client response parsers accept unknown additive v1 fields, validate known fields, and reject unsupported manifest schema versions with an upgrade instruction.

## Decisions Deferred

CLI authentication, custom registries, background auto-update, telemetry, MCP-server OAuth brokerage, and arbitrary client plugins are deferred. Telemetry remains absent by default.
