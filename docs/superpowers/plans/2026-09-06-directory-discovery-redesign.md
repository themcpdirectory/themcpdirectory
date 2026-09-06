# Directory Discovery Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn The MCP Directory from a Registry viewer into a polished discovery, evidence, and `mcpdir` installation product without inventing data.

**Architecture:** Extend `packages/search` with typed discovery queries and re-export them through `packages/domain`; render those view models through server-first Next.js routes and a compact Radix Themes component system. Keep telemetry, sponsorship, trust interpretation, ranking, and collection membership out of React components.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Radix Themes, Tailwind v4/global CSS tokens, PostgreSQL 17, Drizzle ORM, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-06-directory-discovery-redesign-design.md`

## Global Constraints

- Never fabricate install counts, popularity, trending, verification, compatibility, health, publisher identity, official status, repository, licence, or update recency.
- Use `npx @themcpdirectory/cli add <slug>` until the short npm package exists.
- Do not include the main checkout's uncommitted telemetry work in this branch.
- Organic ranking remains independent of future sponsorship.
- Use Radix Themes for accessible controls and retain WCAG 2.2 AA, Forced Colors, reduced motion, and 320px reflow.
- Preserve canonical short server URLs and existing publisher/auth behavior.
- Commit after every task with the exact Conventional Commit message shown.

---

### Task 1: Stabilize the Radix foundation

**Files:**

- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/site-nav.tsx`
- Modify: `apps/web/src/components/theme-control.tsx`
- Modify: `apps/web/src/components/theme-provider.tsx`
- Modify: `packages/ui/src/tokens.css`
- Modify: `apps/web/DESIGN.md`
- Modify: existing pages already changed in the uncommitted Radix foundation

**Interfaces:**

- Produces: stable `ThemeProvider`, `ThemeControl`, shared page/status/form classes, Radix dependency installation, and an accessible dual-theme baseline.
- Consumes: existing semantic tokens and request nonce from `proxy.ts`.

- [ ] Inspect the full current diff and preserve user edits.
- [ ] Run `pnpm --filter @themcpdirectory/web typecheck` and focused existing web tests.
- [ ] Verify the CSP nonce, desktop/mobile navigation behavior, light/dark persistence, and AA action contrast.
- [ ] Commit with `feat(ui): establish radix directory design system`.

### Task 2: Add factual discovery queries

**Files:**

- Modify: `packages/search/src/index.ts`
- Create: `packages/search/src/discovery/types.ts`
- Create: `packages/search/src/discovery/collections.ts`
- Create: `packages/search/src/discovery/queries.ts`
- Create: `packages/search/src/__tests__/discovery.integration.test.ts`
- Modify: `packages/domain/src/servers/search.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Produces:

```ts
export type DiscoverySort = "recommended" | "relevance" | "recent" | "updated" | "stars" | "name";
export interface BrowseServersInput {
  readonly query?: string;
  readonly category?: string;
  readonly publisher?: string;
  readonly client?: SupportedClientId;
  readonly transport?: string;
  readonly registryType?: string;
  readonly officialRegistry?: boolean;
  readonly verified?: boolean;
  readonly sourceAvailable?: boolean;
  readonly openSource?: boolean;
  readonly healthy?: boolean;
  readonly sort?: DiscoverySort;
  readonly page?: number;
  readonly pageSize?: number;
}
export async function browseServers(
  db: Database,
  input?: BrowseServersInput,
): Promise<BrowseServersResult>;
export async function getEcosystemFacts(db: Database): Promise<EcosystemFacts>;
export async function getDiscoverySections(db: Database): Promise<DiscoverySections>;
export async function getRelatedServers(
  db: Database,
  slug: string,
  limit?: number,
): Promise<readonly DiscoveryServer[]>;
export async function getVisibleCollections(db: Database): Promise<readonly CollectionSummary[]>;
export async function getCollection(
  db: Database,
  slug: string,
  input?: PageInput,
): Promise<CollectionDetail | null>;
export async function getPublicPublisher(
  db: Database,
  slug: string,
): Promise<PublicPublisherDetail | null>;
```

- Consumes: existing tables, visibility predicates, recommendation inputs, and supported client IDs.

- [ ] Write failing integration tests proving visibility, sort semantics, every supported filter, non-empty collection visibility, related-server exclusion/ranking, and publisher identity rules.
- [ ] Run `pnpm --filter @themcpdirectory/search exec vitest run src/__tests__/discovery.integration.test.ts` and confirm expected failures.
- [ ] Implement shared SQL projections and queries without duplicating ranking rules.
- [ ] Re-run the focused test, then the full search package suite and typecheck.
- [ ] Commit with `feat(search): add factual discovery queries`.

### Task 3: Build the shared discovery component system

**Files:**

- Create: `apps/web/src/components/brand-mark.tsx`
- Create: `apps/web/src/components/copy-button.tsx`
- Create: `apps/web/src/components/command-block.tsx`
- Create: `apps/web/src/components/server-card.tsx`
- Create: `apps/web/src/components/server-grid.tsx`
- Create: `apps/web/src/components/category-card.tsx`
- Create: `apps/web/src/components/collection-card.tsx`
- Create: `apps/web/src/components/client-badge.tsx`
- Create: `apps/web/src/components/section-header.tsx`
- Create: `apps/web/src/components/site-footer.tsx`
- Modify: `apps/web/src/components/site-nav.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/public/wordmark.svg` or create theme-safe derived assets only when currentColor cannot be applied safely.

**Interfaces:**

- Produces: directly linked discovery cards, compact evidence badges, reusable copy state, broad/reading containers, grouped footer, desktop/mobile navigation.
- Consumes: `DiscoveryServer`, `CategoryWithCount`, `CollectionSummary`, shared theme tokens.

- [ ] Add focused component behavior tests for copy state and navigation/menu semantics.
- [ ] Verify the tests fail for absent components or changed behavior.
- [ ] Implement semantic components with Radix Themes and existing Radix icon family.
- [ ] Ensure no nested cards, no all-green links, no generic “Inspect” action, and no duplicated desktop menu.
- [ ] Run focused tests, typecheck, and formatter.
- [ ] Commit with `feat(web): add discovery interface primitives`.

### Task 4: Rebuild the homepage discovery experience

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/components/home/hero-search.tsx`
- Create: `apps/web/src/components/home/ecosystem-facts.tsx`
- Create: `apps/web/src/components/home/discovery-section.tsx`
- Modify: `apps/web/src/components/search-form.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/e2e/homepage.spec.ts`

**Interfaces:**

- Consumes: `getEcosystemFacts`, `getDiscoverySections`, `getVisibleCollections`, active categories, and shared cards.
- Produces: search-led hero, production-safe CLI command, factual facts strip, recommended/recent/collection/category discovery, and publisher CTA.

- [ ] Update the homepage E2E assertions first for identity, search, public command, real sections, direct card links, and no full Registry dump.
- [ ] Run the homepage spec and confirm it fails against the old information architecture.
- [ ] Implement the server-rendered homepage, omitting empty sections.
- [ ] Validate copy action and `/` search focus without blocking normal keyboard input.
- [ ] Run homepage E2E, accessibility check, and typecheck.
- [ ] Commit with `feat(web): redesign homepage discovery experience`.

### Task 5: Add Browse and search suggestions

**Files:**

- Create: `apps/web/src/app/browse/page.tsx`
- Create: `apps/web/src/app/browse/loading.tsx`
- Create: `apps/web/src/app/api/search/suggestions/route.ts`
- Create: `apps/web/src/components/search-box.tsx`
- Create: `apps/web/src/components/browse/filter-panel.tsx`
- Create: `apps/web/src/components/browse/mobile-filter-dialog.tsx`
- Create: `apps/web/src/components/browse/sort-control.tsx`
- Create: `apps/web/src/components/browse/pagination.tsx`
- Modify: `apps/web/src/app/search/page.tsx`
- Modify: `apps/web/src/components/site-nav.tsx`
- Create: `apps/web/e2e/browse.spec.ts`
- Modify: `apps/web/e2e/search.spec.ts`

**Interfaces:**

- Consumes: `browseServers`, visible categories and collections.
- Produces: `/browse` query contract and `/api/search/suggestions?q=` returning `{ servers, categories, collections }` with maximum sizes `5/3/3`.

- [ ] Write failing route/domain assertions for filters, sort labels, pagination persistence, suggestion result bounds, and keyboard behavior.
- [ ] Run focused tests and confirm failures.
- [ ] Implement server-side Browse query parsing with Zod, Radix controls, sticky desktop filters, and mobile Dialog filters.
- [ ] Implement a 180ms debounced accessible combobox with ArrowUp/ArrowDown, Enter, Escape, and `/` focus.
- [ ] Preserve `/search?q=` and route its results through shared cards.
- [ ] Run Browse/Search E2E, API route tests, accessibility checks, and typecheck.
- [ ] Commit with `feat(browse): add filtered server discovery`.

### Task 6: Add collections, categories, and publishers

**Files:**

- Create: `apps/web/src/app/collections/page.tsx`
- Create: `apps/web/src/app/collections/[slug]/page.tsx`
- Create: `apps/web/src/app/publishers/page.tsx`
- Create: `apps/web/src/app/publishers/[slug]/page.tsx`
- Modify: `apps/web/src/app/categories/page.tsx`
- Modify: `apps/web/src/app/categories/[slug]/page.tsx`
- Modify: `apps/web/src/app/sitemap.ts`
- Create: `apps/web/e2e/collections.spec.ts`
- Modify: `apps/web/e2e/categories.spec.ts`
- Create: `apps/web/e2e/publishers.spec.ts`

**Interfaces:**

- Consumes: visible collection/category/publisher domain queries and shared cards.
- Produces: canonical collection/category/publisher discovery loops and sitemap entries for non-empty public pages.

- [ ] Write failing tests for hidden zero-count categories, non-empty collections, factual inclusion copy, publisher entity lookup, and sitemap entries.
- [ ] Run focused tests and confirm failures.
- [ ] Implement routes and metadata; use stable Radix icons, not emoji.
- [ ] Redirect empty publisher index to Publish guidance and return 404 for unknown entities.
- [ ] Run focused E2E, metadata checks, typecheck, and formatter.
- [ ] Commit with `feat(web): add collections and publisher discovery`.

### Task 7: Rebuild server installation landing pages

**Files:**

- Modify: `apps/web/src/app/[slug]/page.tsx`
- Modify: `apps/web/src/components/server-detail-header.tsx`
- Modify: `apps/web/src/components/install-command.tsx`
- Modify: `apps/web/src/components/server-evidence-summary.tsx`
- Modify: `apps/web/src/components/trust-profile.tsx`
- Modify: `apps/web/src/components/health-observation.tsx`
- Create: `apps/web/src/components/metadata-grid.tsx`
- Create: `apps/web/src/components/related-servers.tsx`
- Create: `apps/web/src/lib/cli-command.ts`
- Modify: `apps/web/e2e/server-detail.spec.ts`
- Modify: `apps/web/e2e/detail.spec.ts`

**Interfaces:**

- Consumes: `getRelatedServers`, public detail trust/health/compatibility, install availability, package/remotes and env-var names.
- Produces: responsive 8/4 install-first layout, production-safe CLI commands, quiet unknown-state summary, structured metadata, and deterministic related servers.

- [ ] Write failing tests for installation placement/content, public command, requirements disclosure, known-only evidence, related-server links, and absent-empty-section behavior.
- [ ] Run focused E2E and confirm failures.
- [ ] Implement the layout with sticky install rail on desktop and source order immediately after identity on mobile.
- [ ] Use `Copy` → `Copied` and a 2-second reset; retain accessible failure status.
- [ ] Run detail E2E, accessibility checks, typecheck, and formatter.
- [ ] Commit with `feat(web): rebuild server installation pages`.

### Task 8: Refine docs, publish, licensing, and SEO

**Files:**

- Modify: `apps/web/src/components/document-page.tsx`
- Modify: `apps/web/src/app/docs/**/page.tsx`
- Modify: `apps/web/src/app/publish/page.tsx`
- Modify: `apps/web/src/app/open-source/page.tsx`
- Modify: `apps/web/src/content/open-source.ts`
- Modify: `apps/web/src/content/release-nav.ts`
- Modify: `packages/cli/src/command-metadata.ts`
- Modify: `apps/web/src/lib/metadata.ts` and structured data only where required.
- Modify: relevant document/CLI/metadata E2E specs.

**Interfaces:**

- Produces: branded docs layout, current public CLI usage, onboarding-style Publish page, accurate repository-vs-package licensing copy, grouped footer navigation, and new route metadata.
- Consumes: current npm package truth and existing legal document model.

- [ ] Write failing assertions for public CLI invocation and licence distinction.
- [ ] Verify repository licence state directly; do not select or imply a licence.
- [ ] Update CLI metadata so public docs do not call the package private.
- [ ] Implement docs navigation and concise Publish workflow without inventing CLI commands.
- [ ] Remove Open Source from promotional navigation when repository licensing remains absent.
- [ ] Run document/CLI/metadata tests, typecheck, and formatter.
- [ ] Commit with `feat(docs): align developer and publisher experience`.

### Task 9: Responsive, accessibility, performance, and release verification

**Files:**

- Modify only files implicated by findings.
- Update: `apps/web/DESIGN.md` from the built system.
- Create screenshots under ignored `.impeccable/review/`.

**Interfaces:**

- Consumes: complete implementation and original redesign brief.
- Produces: release evidence and a clean worktree.

- [ ] Run one batched visual inspection at 320, 375, 390, 430, 768, 1024, 1440, 1920, and 2560px across representative light/dark pages.
- [ ] Validate keyboard search, filters, mobile menu, copy states, overflow, and reduced motion.
- [ ] Run the Impeccable detector once over changed UI and fix mechanical findings in one batch.
- [ ] Run formatter, lint, typecheck, unit/integration tests, production build, targeted E2E, and automated accessibility checks.
- [ ] Dispatch a final independent code review; address Critical and Important findings and re-run affected checks.
- [ ] Update `apps/web/DESIGN.md` to describe the shipped system.
- [ ] Commit with `fix(web): complete responsive directory QA` or `docs(ui): document discovery design system` as appropriate.
- [ ] Confirm `git status --short` is clean and record all commit hashes/messages for the final report.
