# The MCP Directory Discovery Redesign

**Date:** 2026-09-06
**Status:** Approved by the supplied redesign brief

## Product Thesis

The MCP Directory is the discovery, evidence, and installation surface for the MCP ecosystem. It is not a Registry database viewer. The website helps a developer understand what a server does, inspect factual provenance and operational evidence, and move into a reviewed `mcpdir` installation flow.

The first five seconds must communicate:

1. this is a directory for MCP servers;
2. servers can be searched and explored without knowing an exact name;
3. `mcpdir` is the installation and management surface;
4. Codex, Claude Code, Cursor, and VS Code are supported CLI targets;
5. trust information is factual evidence, never a score or guarantee.

## Truth Boundaries

The current local data contains thousands of active Official Registry listings, but category assignment, client compatibility, and verified publisher coverage are sparse. The UI must therefore render sections only when their underlying records exist.

- Recommendation order may use the existing transparent recommendation inputs: public visibility, Official Registry provenance, verified publisher state, metadata completeness, and recent repository maintenance.
- `recent` uses `servers.firstSeenAt`.
- `updated` uses latest repository push time when observed, otherwise `servers.lastSeenAt`.
- Repository-star sorting must be labelled “Most starred”, never “Popular” in user-facing copy.
- No “Trending”, install-count, co-install, successful-install-rate, or “popular by client” UI ships without approved, trustworthy telemetry.
- No client compatibility badge appears without a current `supported` or `supported_with_configuration` observation.
- No publisher is called verified unless `publishers.verificationState` is `verified`.
- Missing evidence is omitted from the primary hierarchy and summarized quietly only when it helps a decision.
- Sponsored placement remains separate from organic selection, labelled, and absent until a real sponsorship product exists.

The uncommitted telemetry and install-count badge work in the main checkout is parallel work and is not copied into this branch. It requires privacy/legal approval before any public usage metric appears.

## Public CLI Command

The short npm package `mcpdir` is not published. The current public package is `@themcpdirectory/cli@0.1.2`, exposing the `mcpdir` binary. Website commands use a single shared helper and this production-safe invocation:

```text
npx @themcpdirectory/cli add <slug>
```

The helper is the only source changed when a short package alias becomes available.

## Information Architecture

### Global navigation

Desktop navigation is `Browse`, `Collections`, `Docs`, and `Publish`. GitHub and a compact three-state theme control sit on the right. Security moves to developer/footer navigation. The desktop menu button is not rendered. Mobile uses a labelled menu button and disclosure.

The footer groups links under Product, Developers, Company, and Legal. It includes the factual source line “Built on data from the Official MCP Registry.”

### Homepage `/`

The homepage is a discovery surface, not the full index.

1. Brand-led hero with prominent `mcp>_`, product name, “Find it. Trust it. Install it.”, and a polished search.
2. Production-safe CLI command with copy action.
3. Factual ecosystem strip: indexed active servers, four CLI targets, Official Registry source, and verified publishers only when non-zero.
4. Recommended servers using the existing transparent recommendation order.
5. Recently added servers using `firstSeenAt`.
6. Collections derived from explicit criteria.
7. Active categories only.
8. Publisher call to action.

Sections disappear rather than showing empty shells.

### Browse `/browse`

This route owns comprehensive directory browsing. It uses server-side query parameters and pagination. Supported facets are:

- query;
- category;
- client;
- transport;
- package registry;
- publisher;
- Official Registry;
- verified publisher;
- source available;
- open source;
- healthy remote endpoint.

Only facets supported accurately by the domain query ship. Sorts are relevance (only with a query), recently added, recently updated, name, and most starred. Filters survive pagination. Desktop uses a compact sticky filter rail; mobile uses a Radix Dialog/Sheet-style filter panel with a visible summary and clear action.

`/search` remains a compatible search route and presents the same result component. Existing links continue to work.

### Collections

`/collections` and `/collections/[slug]` provide goal-oriented discovery. Initial collections are explicit, version-controlled definitions backed by factual predicates:

- Official Registry essentials: active official entries ordered by recommendation inputs;
- Recently added: active entries ordered by `firstSeenAt`;
- Remote MCPs: current versions with a remote endpoint;
- Open source: `openSource is true`;
- Source available: `sourceAvailable is true`;
- Works with each supported client only when compatibility observations exist.

Collections with no matching servers are not shown. A collection page explains its exact inclusion rule.

### Categories

`/categories` shows only categories with at least one active, normally moderated listing. Cards use a stable Radix icon mapping and show name, description, and real count. Category pages link into Browse with the category facet, retain their canonical route, and show related non-empty categories or collections where factual.

### Server pages `/:slug`

The page order is identity, installation, available trust/provenance, requirements and compatibility, technical details, related servers, and README badge guidance when a real endpoint exists.

Desktop uses an 8/4 grid with a sticky install rail. Mobile places installation immediately after identity. The identity region shows only known publisher/source/license facts. Required environment-variable names are shown before installation; values are never shown.

Related servers use deterministic overlap: shared category first, then same publisher, then recommendation order, excluding the current server and non-public records. If no meaningful relationship exists, the section is omitted.

### Publishers

`/publishers/[slug]` is created only for a stored publisher entity. It shows factual verification state, website/GitHub organization when available, and active public servers. Links use publisher slugs from the database, never inferred strings. `/publishers` lists verified publishers only when records exist; otherwise it redirects to Publish guidance.

### Documentation and legal surfaces

Docs use a persistent left navigation and readable 760–900px content column. CLI docs use public npm invocation. Publish becomes a concise onboarding flow linked to Official Registry documentation and existing claim capabilities.

The Open Source Status page remains factual: public source visibility and the npm CLI package licence are distinct from the repository licence. The route is removed from primary/footer marketing if the repository has no explicit licence, while Security remains easy to find.

## Visual System

### Direction

A premium developer ecosystem with the clarity of package tooling and the recognizable `mcp>_` prompt identity. It uses Radix Themes for interaction primitives and custom composition for discovery.

- Discovery and detail containers: 80rem maximum.
- Reading containers: 52rem maximum.
- Geist for interface and reading; Geist Mono only for commands, identifiers, versions, and compact technical labels.
- Near-black/near-white neutral foundations with exact existing terminal green `#44ef56` as the dark brand accent and existing accessible dark green for light-theme actions.
- Green is reserved for the brand mark, primary actions, selected state, and positive verified observations. Ordinary links use primary text plus underline/hover treatment.
- Card radii remain compact at 6px. Cards use subtle surface contrast and restrained borders; repeated full-width rules are removed.
- No gradients, glass, glow, oversized pills, terminal simulation, or generic SaaS feature-card pattern.

### Brand assets

The existing `wordmark.svg` geometry and `icon.svg` prompt symbol are source assets. A currentColor-compatible BrandMark component preserves their visual identity in both themes. The homepage displays the full `mcp>_` signature at memorable scale; compact surfaces use `>_`.

### Interaction

The signature interaction is command fluency: search focus via `/`, keyboard-navigable grouped suggestions, one-click command copy with `Copy` → `Copied`, and directly clickable server cards. Motion is limited to 120–180ms state transitions and a single restrained first-load reveal, disabled under reduced motion.

## Architecture

Business rules live in `packages/search` and are re-exported through `packages/domain`. React consumes explicit view models.

New domain interfaces:

```ts
interface EcosystemFacts {
  activeServers: number;
  officialServers: number;
  verifiedPublishers: number;
  supportedClientTargets: 4;
}

interface DiscoveryServer {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  publisher: { slug: string; name: string; verified: boolean } | null;
  categorySlugs: readonly string[];
  officialRegistry: boolean;
  sourceAvailable: boolean | null;
  openSource: boolean | null;
  supportedClients: readonly SupportedClientId[];
  transports: readonly string[];
  firstSeenAt: Date;
  updatedAt: Date;
  repositoryStars: number | null;
}

interface BrowseServersInput {
  query?: string;
  category?: string;
  publisher?: string;
  client?: SupportedClientId;
  transport?: string;
  registryType?: string;
  officialRegistry?: boolean;
  verified?: boolean;
  sourceAvailable?: boolean;
  openSource?: boolean;
  healthy?: boolean;
  sort: "relevance" | "recent" | "updated" | "stars" | "name";
  page: number;
  pageSize: number;
}
```

Collection definitions are static product configuration; membership is resolved in the domain query from factual predicates. Search suggestions use a small route handler returning at most five servers, three categories, and three visible collections. It debounces requests and never downloads the full directory.

No database migration is required for this redesign. Future telemetry and sponsorship remain separate approved projects.

## Accessibility and Responsive Behavior

- WCAG 2.2 AA target, semantic landmarks, one `h1`, stable skip target.
- Native controls or Radix patterns with documented keyboard behavior.
- Search suggestions use combobox/listbox semantics, arrow navigation, Escape, and active descendant management.
- Focus indicators retain at least 3:1 contrast; text and controls meet AA contrast in both themes.
- Mobile is designed at 320, 375, 390, and 430px; tablet at 768 and 1024px; desktop at 1440, 1920, and 2560px.
- No page-level horizontal overflow. Long package names and URLs wrap. Command blocks provide internal wrapping rather than clipping.
- Forced Colors and reduced motion remain supported.

## Performance and SEO

Server Components render discovery content. Client JavaScript is limited to search suggestions, copy actions, theme selection, and mobile filters. Browse filtering and pagination are server-side. No huge dataset is serialized to the browser.

Canonical short server URLs remain unchanged. New Browse, Collection, and Publisher pages receive truthful metadata and canonicals. Sitemap generation includes only non-empty collections and public publisher pages. Structured data remains limited to truthful SoftwareApplication and breadcrumb facts.

## Verification

Each domain behavior is implemented test-first with focused integration tests. Existing route and accessibility suites are extended for changed flows. Final verification includes formatting, lint, typecheck, package tests, production build, selected E2E flows, accessibility checks, and bounded visual QA across the specified viewport classes in both themes.
