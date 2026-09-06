# The MCP Directory Design System

## Direction

The interface is a technical trust ledger: a dense, calm registry in which source, health, compatibility, and installation evidence can be compared without turning those observations into scores. It keeps the established near-black canvas, white text, green action color, compact radii, Geist, and Geist Mono. It does not copy the identity, ASCII wordmark, monochrome palette, popularity ranking, or animation language of `skills.sh`.

The product is usually used by a developer at a desktop workstation under ordinary indoor light. The dark canvas reduces visual noise around dense technical records; white and green remain crisp enough for fast scanning.

## Composition

- A maximum content width of `72rem` aligns navigation, search, directory rows, and detail evidence.
- The first viewport follows Identify → Search → Evaluate. Product identity stays concise; the search control is the dominant action; real directory entries begin before the viewport ends on common desktop displays.
- Public listing surfaces share one full-width row composition rather than switching between cards and lists.
- Rows use stable columns and horizontal rules. They are not floating cards.
- The detail route follows Identify → Verify → Install. Identity and actionable installation state share the first viewport; full evidence follows in ordinary document flow.
- Legal pages are reading surfaces with a narrow prose column, document metadata, local contents navigation, and structured tables where the source material is tabular.

## Color And Material

Use only shared color tokens. The system is restrained: neutral fields carry most of the surface and green identifies primary actions, links, focus, and positive factual states. Amber and red communicate warning and error states with text or icon support, never color alone.

Borders and ruled rows are the primary material. Shadows, glass effects, decorative gradients, glow, and ornamental terminal chrome are outside the system. Surfaces may step from `--bg` to `--surface` or `--surface-2` to establish hierarchy.

## Typography

- Geist is the reading and interface face.
- Geist Mono is used for commands, identifiers, transport names, timestamps, state labels, and tabular evidence.
- Page titles are compact and literal. Hero-scale typography is reserved for the homepage identity and must not push real directory content below the first viewport.
- Labels use normal letter spacing. Uppercase is reserved for short machine-like state labels, not paragraphs or navigation.
- Numeric and timestamp columns use tabular numerals.

## Components

### Navigation

The primary navigation is Browse, Security, Docs, and Publish. Publisher Dashboard is contextual rather than a universal primary destination. Desktop navigation is inline; mobile navigation uses a native button and disclosure region with unchanged reading order.

### Search

Search always has a persistent visible label. The control is at least `44px` high, supports submission by keyboard, and keeps query text in the URL. Supporting filters use native controls or established accessible primitives.

### Directory Rows

Each row has one linked title and a predictable reading order:

1. Server identity, publisher, and short description.
2. Registry/source state.
3. Health and observation age when available.
4. Transport and supported clients when available.
5. A direct inspect action.

At narrow widths, metadata moves below the identity rather than disappearing. Unknown values are shown as “Not observed” or omitted with an explanatory group label; they are never inferred.

### Evidence States

Trust and health language reports observations only. Allowed patterns include “Official Registry listing”, “Source repository linked”, “Observed healthy”, “Last checked …”, and “Not observed”. Avoid “safe”, “trusted”, “verified secure”, aggregate scores, ratings, and certification language.

### Installation

Commands are selectable text with a labeled copy button. Installation changes remain reviewable before execution. Secret values are never rendered back to the user.

### Legal Documents

Document status, version, effective date, and last-updated date are separate metadata fields. Unknown or unapproved legal values remain clearly marked as unresolved release blockers outside final policy prose. Cookie data uses a semantic table with headers and a component-level horizontal scroll exception on narrow screens.

## Interaction And Motion

The signature interaction is evidence focus: focusing or hovering a directory row increases rule contrast and reveals its direct action without moving surrounding content. Search result changes may use one short opacity transition. There is no typewriter, terminal boot, marquee, continuous logo motion, or decorative cursor animation.

All content remains visible without animation. `prefers-reduced-motion: reduce` removes non-essential transitions. Hover is never required to discover an action.

## Responsive Rules

- At and below `40rem`, multi-column regions stack, navigation becomes a disclosure, and row metadata wraps beneath identity.
- At and above `64rem`, evidence receives aligned columns for faster comparison.
- Fixed-format controls retain stable dimensions. Flexible children use `min-width: 0`, and long identifiers use `overflow-wrap: anywhere`.
- The page reflows at `320px` without horizontal page scrolling. Only a semantically tabular legal data region may scroll horizontally inside its own labeled container.

## Accessibility

- One `h1` and one `main#main-content` per route.
- The skip link is the first focusable element and its target remains stable through Suspense updates.
- Every interactive element has a visible label included in its accessible name.
- Focus indicators have at least 3:1 contrast and remain visible in Forced Colors.
- Text meets WCAG 2.2 AA contrast thresholds; state is never conveyed by color alone.
- Decorative icons are hidden from assistive technology; informative icons have accessible alternatives.
- Touch targets are at least `44px` where practical and never below WCAG 2.2 target-size requirements.

## Quality Bar

The finished interface must feel as intentional and dense as a mature developer registry while remaining unmistakably The MCP Directory. It is complete only after desktop and mobile browser captures, keyboard and accessibility checks, the Impeccable detector, finish review, and release verification.
