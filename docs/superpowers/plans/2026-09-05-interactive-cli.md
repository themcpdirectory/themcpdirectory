# Interactive CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make no-argument `mcpdir` an interactive TTY application while preserving every explicit command and automation contract.

**Architecture:** A session controller gathers menu choices and delegates to the existing command dispatcher. `@inquirer/prompts` is isolated behind `PromptIO`; tests use deterministic doubles. Non-TTY invocation never opens a prompt.

**Tech Stack:** Node.js 24, TypeScript, `@inquirer/prompts`, Vitest, esbuild, Rollup

**Spec:** `docs/superpowers/specs/2026-09-05-product-experience-redesign-design.md`

## Global Constraints

- Explicit commands, help/version, JSON envelopes, sanitization, and exit codes remain byte-compatible.
- No prompt text enters redirected or JSON output.
- Secrets are masked and never echoed or retained.
- `Ctrl+C` and EOF exit without a stack trace and restore terminal state.
- Package and tarball changes must pass the strict four-file publish allowlist.

---

### Task 1: Session Entry Contract

**Files:**

- Create: `packages/cli/src/__tests__/interactive-session.test.ts`
- Modify: `packages/cli/src/cli.ts`
- Create: `packages/cli/src/interactive/session.ts`

**Interfaces:**

- Produces: `runInteractiveSession(deps: CliDependencies): Promise<number>`
- Consumes: the same dispatcher used by `runCli`

- [ ] Test that empty argv with non-interactive dependencies prints the existing help exactly.
- [ ] Test that empty argv with interactive dependencies calls the session and explicit commands never do.
- [ ] Run the focused test and confirm the interactive branch is missing.
- [ ] Extract an internal command dispatch function and add the narrow empty-argv TTY branch.
- [ ] Re-run the focused test and all existing CLI integration tests.

### Task 2: Prompt Adapter

**Files:**

- Modify: `packages/cli/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/cli/src/dependencies.ts`
- Create: `packages/cli/src/prompts/inquirer.ts`
- Test: `packages/cli/src/__tests__/prompt-io.test.ts`

**Interfaces:**

- Produces: stable label/value selections, text/password/confirm prompts, and a normalized cancellation error
- Consumes: injected input/output streams and `MCPDIR_PROMPT_MODE=numbered|select`

- [ ] Add failing prompt-adapter tests for select, numbered fallback, stream injection, and cancellation normalization.
- [ ] Run the focused test and confirm the adapter is absent.
- [ ] Add `@inquirer/prompts` as a runtime dependency and implement the adapter behind `PromptIO`.
- [ ] Keep `PromptIO` test doubles source-compatible or update the shared harness once with explicit stable choices.
- [ ] Re-run focused tests, typecheck, lint, and dependency audit.

### Task 3: Guided Workflows

**Files:**

- Modify: `packages/cli/src/interactive/session.ts`
- Test: `packages/cli/src/__tests__/interactive-session.test.ts`

**Interfaces:**

- Main actions: `discover`, `inspect`, `install`, `installed`, `update`, `remove`, `doctor`, `quit`
- Command mapping: search, info, add, list, update, remove, doctor

- [ ] Add one failing test per menu action, plus Back, repeated actions, operational failure, and Quit.
- [ ] Run the focused suite and verify failures are caused by missing mappings.
- [ ] Implement minimal argument collection and dispatch for each primary workflow.
- [ ] Return to the main menu after command output; preserve the executed command's result in session history without terminating the session.
- [ ] Re-run focused and full CLI tests.

### Task 4: Real Terminal Verification

**Files:**

- Create: `packages/cli/src/__tests__/interactive-binary-smoke.test.ts`
- Modify if required: `tooling/release/src/verify-cli-tarball.ts`

- [ ] Add a PTY test that launches the built binary, moves through one arrow-key selection, quits, and asserts clean terminal restoration.
- [ ] Run it first against the pre-feature binary and confirm failure.
- [ ] Make only the packaging or stream fixes needed for the real binary.
- [ ] Re-run CLI test, typecheck, lint, build, tarball verifier, and external consumer compile.
