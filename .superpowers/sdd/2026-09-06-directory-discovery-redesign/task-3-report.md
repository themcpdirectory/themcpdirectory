# Task 3 Report: Discovery Interface Primitives

## Scope

Implemented the shared discovery component layer in the `radix-themes-redesign` worktree.

This task introduced the reusable brand, copy, command, card, footer, and navigation primitives that later route tasks can compose without reintroducing old row/list patterns or all-green link styling.

## Requirements Covered

- Added a theme-safe `BrandMark` component that preserves the existing `mcp>_` geometry and uses the established green action token.
- Added a reusable `CopyButton` with `Copy` → `Copied` state, accessible status text, failure messaging, and a 2-second reset.
- Added a `CommandBlock` primitive for CLI/install surfaces.
- Added compact `ServerCard` and `ServerGrid` primitives and switched the legacy `ServerDirectoryList` to them so current listing surfaces no longer use a separate `Inspect` action.
- Added `ClientBadge`, `CategoryCard`, `CollectionCard`, and `SectionHeader` primitives for later homepage/browse/collection/category work.
- Replaced the old release-link footer with a grouped `SiteFooter` and factual source line.
- Simplified global navigation to Browse, Collections, Docs, Publish, GitHub, and theme control.
- Kept interactivity isolated to small client islands: `CopyButton` and `SiteNavMenu`.
- Preserved Task 1’s CSP-safe theme bootstrap, skip link, reduced motion handling, and shared token system.
- Added a minimal `/collections` route so the new global navigation does not dead-end before the later collections task lands.

## TDD Record

### Red

Created focused tests first:

- `apps/web/src/components/copy-button.test.ts`
- `apps/web/src/components/site-nav.test.tsx`

Initial focused command:

```sh
pnpm --dir /Users/timohaseloff/themcpdirectory/.worktrees/radix-themes-redesign --filter @themcpdirectory/web exec vitest run src/components/copy-button.test.ts src/components/site-nav.test.tsx
```

Observed expected RED failures:

- `./copy-button` did not exist yet.
- `SiteNav` still rendered the old Browse/Security/Docs/Publish navigation rather than Browse/Collections/Docs/Publish/GitHub.

### Green

Implemented the new primitives and reran the focused tests until they passed.

Final focused result:

- 2 test files passed
- 3 tests passed

## Validation

Focused behavior:

```sh
pnpm --dir /Users/timohaseloff/themcpdirectory/.worktrees/radix-themes-redesign --filter @themcpdirectory/web exec vitest run src/components/copy-button.test.ts src/components/site-nav.test.tsx
```

Static verification:

```sh
pnpm --dir /Users/timohaseloff/themcpdirectory/.worktrees/radix-themes-redesign --filter @themcpdirectory/web typecheck
pnpm --dir /Users/timohaseloff/themcpdirectory/.worktrees/radix-themes-redesign --filter @themcpdirectory/web lint
pnpm --dir /Users/timohaseloff/themcpdirectory/.worktrees/radix-themes-redesign exec prettier --check \
  apps/web/src/components/brand-mark.tsx \
  apps/web/src/components/copy-button.tsx \
  apps/web/src/components/command-block.tsx \
  apps/web/src/components/client-badge.tsx \
  apps/web/src/components/server-card.tsx \
  apps/web/src/components/server-grid.tsx \
  apps/web/src/components/category-card.tsx \
  apps/web/src/components/collection-card.tsx \
  apps/web/src/components/section-header.tsx \
  apps/web/src/components/site-footer.tsx \
  apps/web/src/components/site-nav-menu.tsx \
  apps/web/src/components/site-nav.tsx \
  apps/web/src/components/server-directory-list.tsx \
  apps/web/src/components/copy-button.test.ts \
  apps/web/src/components/site-nav.test.tsx \
  apps/web/src/app/layout.tsx \
  apps/web/src/app/globals.css \
  apps/web/src/app/collections/page.tsx
```

Validation results:

- focused Vitest slice passed: 2 files, 3 tests
- `@themcpdirectory/web` typecheck passed
- `@themcpdirectory/web` lint passed
- Prettier check passed on all Task 3 files

## Files Changed

- `apps/web/src/app/collections/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/components/brand-mark.tsx`
- `apps/web/src/components/category-card.tsx`
- `apps/web/src/components/client-badge.tsx`
- `apps/web/src/components/collection-card.tsx`
- `apps/web/src/components/command-block.tsx`
- `apps/web/src/components/copy-button.test.ts`
- `apps/web/src/components/copy-button.tsx`
- `apps/web/src/components/section-header.tsx`
- `apps/web/src/components/server-card.tsx`
- `apps/web/src/components/server-directory-list.tsx`
- `apps/web/src/components/server-grid.tsx`
- `apps/web/src/components/site-footer.tsx`
- `apps/web/src/components/site-nav-menu.tsx`
- `apps/web/src/components/site-nav.test.tsx`
- `apps/web/src/components/site-nav.tsx`

## Concerns

- The environment still emits the existing engine warning because the workspace expects Node `>=24.10 <25` while the current shell is running Node `v26.5.0`. All requested tests and static checks passed under this environment.
- `Browse` still routes to the existing `/search` surface until Task 5 introduces the canonical `/browse` route and search-suggestion behavior.