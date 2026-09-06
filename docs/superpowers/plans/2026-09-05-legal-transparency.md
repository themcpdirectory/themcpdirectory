# Legal Transparency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add accurate cookie and operator disclosures and make all legal documents easier to navigate without presenting draft legal decisions as final.

**Architecture:** A richer typed document model renders paragraphs, lists, definitions, and tables without raw HTML. Cookie and operator pages are static projections of verified repository facts; unresolved facts remain in the production blocker document.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-09-05-product-experience-redesign-design.md`

## Global Constraints

- Privacy and Terms retain the legal-review draft banner.
- Do not invent registration, contact, processor, transfer, lawful-basis, governing-law, or effective-date facts.
- Do not add a consent banner while only strictly necessary cookies exist.
- Cookie names and attributes must match authentication behavior.
- Use semantic headings, lists, definition lists, and tables.

---

### Task 1: Structured Document Model

**Files:**

- Modify: `apps/web/src/content/document-model.ts`
- Modify: `apps/web/src/components/document-page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/components/document-page.test.tsx`

**Interfaces:**

- Produces: discriminated document blocks for paragraphs, lists, definitions, and tables plus optional status metadata

- [ ] Add failing renderer tests for metadata, contents links, list semantics, definition semantics, and table headers.
- [ ] Run the focused Vitest file and confirm the new block variants are unsupported.
- [ ] Extend the model and renderer without `dangerouslySetInnerHTML`.
- [ ] Add narrow prose and component-level table overflow styles.
- [ ] Re-run focused tests, typecheck, and lint.

### Task 2: Cookie Policy

**Files:**

- Modify: `apps/web/src/content/legal.ts`
- Create: `apps/web/src/app/cookies/page.tsx`
- Modify: `apps/web/src/content/release-nav.ts`
- Modify: `apps/web/e2e/legal-and-governance.spec.ts`

**Interfaces:**

- Produces: `getCookiePolicyDocument(): ReleaseDocument`

- [ ] Add failing route assertions for both cookie names, purposes, durations, attributes, necessary classification, and footer link.
- [ ] Add a failing assertion that no cookie-consent banner is rendered.
- [ ] Run the focused Playwright spec and confirm `/cookies` is missing.
- [ ] Implement the policy from verified Better Auth behavior and cross-link Privacy.
- [ ] Re-run the focused spec and auth cookie tests.

### Task 3: Operator Information

**Files:**

- Modify: `apps/web/src/content/legal.ts`
- Create: `apps/web/src/app/operator/page.tsx`
- Modify: `apps/web/src/content/release-nav.ts`
- Modify: `docs/production-authorisation-blockers.md`
- Modify: `apps/web/e2e/legal-and-governance.spec.ts`

**Interfaces:**

- Produces: `getOperatorInformationDocument(): ReleaseDocument`

- [ ] Add failing assertions for operator name, postal address, qualified draft status, footer link, and absence of an invented email or registration number.
- [ ] Run the focused spec and confirm `/operator` is missing.
- [ ] Implement the operator page using only existing verified facts.
- [ ] Record unresolved registration, electronic-contact, representative, and VAT facts in the release blocker document.
- [ ] Re-run the focused spec and documentation consistency checks.

### Task 4: Privacy And Terms Wayfinding

**Files:**

- Modify: `apps/web/src/content/legal.ts`
- Modify: `apps/web/e2e/legal-and-governance.spec.ts`

- [ ] Add failing assertions for document status metadata, local contents navigation, and links among Privacy, Terms, Cookies, Security, and Operator Information.
- [ ] Run the focused spec and verify the new wayfinding is absent.
- [ ] Convert existing content to structured blocks and add factual cross-links without changing unresolved legal positions.
- [ ] Re-run legal E2E, web typecheck, lint, and release documentation checks.

### Task 5: Storage Inventory Guard

**Files:**

- Modify: `packages/auth/src/__tests__/github-oauth-flow.integration.test.ts`
- Modify: `apps/web/e2e/legal-and-governance.spec.ts`

- [ ] Add assertions for host-only scope, absent `Domain`, expected expiry, and absence of `session_data` and `account_data` cookies.
- [ ] Add browser storage/network assertions that fail on unapproved non-essential storage or known tracking requests.
- [ ] Run focused auth and browser tests and fix only discrepancies in documentation or implementation exposed by those tests.
- [ ] Run all legal, auth, and production E2E checks.
