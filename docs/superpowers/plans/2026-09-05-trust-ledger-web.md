# Trust Ledger Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inconsistent public listing cards with one accessible, evidence-led discovery interface and improve the first viewport of server details.

**Architecture:** Existing domain queries remain unchanged. Focused server-side presentation helpers feed shared semantic React components; route files own composition only. Global CSS classes implement the documented Trust Ledger system and preserve the stable Suspense main landmark.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4 tokens, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-09-05-product-experience-redesign-design.md`

## Global Constraints

- Preserve one `main#main-content`, one `h1`, the first-focusable skip link, and existing canonical redirects.
- Never derive a trust score, certification, endorsement, or unobserved fact.
- Preserve server components unless browser interaction requires a client component.
- Reflow at 320px; preserve Forced Colors and reduced-motion behavior.
- Do not add analytics, tracking, third-party embeds, or decorative image dependencies.

---

### Task 1: Shared Directory Row

**Files:**

- Create: `apps/web/src/components/server-directory-row.tsx`
- Create: `apps/web/src/components/server-directory-list.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/search/page.tsx`
- Modify: `apps/web/src/app/categories/[slug]/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/e2e/public-directory.spec.ts`

**Interfaces:**

- Consumes: `DirectoryServerListing`
- Produces: `ServerDirectoryRow({ server })` and `ServerDirectoryList({ servers, emptyMessage })`

- [ ] Add a Playwright assertion that home, search, and category results share the same row marker and expose title, publisher, official-registry state, description, and inspect link.
- [ ] Run `pnpm --filter @themcpdirectory/web exec playwright test e2e/public-directory.spec.ts` and confirm the missing shared row fails.
- [ ] Implement semantic list/row components and replace the three route-specific presentations.
- [ ] Add responsive ruled-row CSS with stable mobile reading order and 44px links.
- [ ] Re-run the focused Playwright test, then `pnpm --filter @themcpdirectory/web typecheck`.

### Task 2: Discovery First Viewport

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/search-form.tsx`
- Modify: `apps/web/src/components/site-nav.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/e2e/homepage.spec.ts`
- Test: `apps/web/e2e/navigation.spec.ts`

**Interfaces:**

- Consumes: existing `SearchForm` GET navigation and category links
- Produces: Browse/Security/Docs/Publish navigation and the Identify → Search → Evaluate viewport

- [ ] Add failing assertions for the revised navigation labels, visible search label, client/category entry points, and a first server row on a 1440×900 viewport.
- [ ] Run the two focused specs and verify the expected failures.
- [ ] Implement the compact masthead, search-led intro, entry-point rail, and first directory section without moving `main#main-content` inside Suspense.
- [ ] Add only one restrained entry transition and disable it under reduced motion.
- [ ] Re-run focused specs, typecheck, lint, and the existing accessibility route spec.

### Task 3: Server Detail Hierarchy

**Files:**

- Create: `apps/web/src/components/server-detail-header.tsx`
- Create: `apps/web/src/components/server-evidence-summary.tsx`
- Create: `apps/web/src/components/install-command.tsx`
- Modify: `apps/web/src/app/[slug]/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/e2e/server-detail.spec.ts`

**Interfaces:**

- Consumes: the existing canonical server detail, trust profile, health observation, variants, and compatibility values
- Produces: first-viewport identity/evidence/install sections without changing data fetching

- [ ] Add failing assertions for the ordered first-viewport regions and timestamped evidence language.
- [ ] Run the focused detail spec and confirm the ordering assertion fails.
- [ ] Extract focused presentation components while preserving the repeatable-read query and redirects.
- [ ] Add a labeled command copy control with a polite success status and selectable command text.
- [ ] Re-run detail, accessibility, typecheck, and lint checks.

### Task 4: Web Visual Verification

**Files:**

- Modify as required by findings: `apps/web/src/app/globals.css` and touched components only
- Create: `apps/web/.impeccable/review/desktop.png`
- Create: `apps/web/.impeccable/review/mobile.png`

- [ ] Build and start the production web app with the repository E2E environment.
- [ ] Capture the homepage at 1440px and 390px and inspect both files for clipping, overlap, and first-viewport hierarchy.
- [ ] Verify keyboard order, skip-link focus, 320px reflow, Forced Colors, reduced motion, names, roles, and labels.
- [ ] Run the Impeccable detector once on changed web targets and fix mechanical findings.
- [ ] Run the independent finish reviewer and resolve its material findings within the allowed review rounds.
- [ ] Run `pnpm --filter @themcpdirectory/web test`, `typecheck`, `lint`, and production E2E.
