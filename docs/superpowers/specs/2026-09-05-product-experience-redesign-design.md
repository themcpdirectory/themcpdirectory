# Product Experience Redesign

**Status:** Approved for autonomous implementation; publication and legal approval remain separate.

## Goal

Improve the public directory, human CLI workflow, and legal transparency as one coherent product experience. The user should be able to find an MCP server, inspect factual evidence, and install or manage it without learning command syntax first or mistaking directory observations for guarantees.

## Scope And Sequence

The work has three independently testable tracks:

1. Public discovery and server detail redesign.
2. Interactive no-argument CLI session.
3. Structured legal, cookie, and operator disclosures.

They share product language and accessibility requirements but do not share runtime state. Implement and validate each track separately before the final release gate.

## Web Architecture

### Shared Directory Projection

Introduce one presentation model for public directory rows. It consumes existing domain results and exposes only observed values required for display: identity, publisher, description, categories, official-registry state, source state, health state and observation time, transport, supported clients, and canonical URL. Missing evidence remains unknown; the projection must not synthesize ratings or claims.

Use one `ServerDirectoryRow` on the homepage, search results, and category detail routes. The semantic container is a list of articles or links, not an ARIA grid, because rows are navigational records rather than an editable composite widget.

### Homepage

The stable `main#main-content` remains outside Suspense. The first viewport contains a concise product identifier, literal value statement, persistent-label search, small client/category entry points, and the beginning of real server results. The page avoids a marketing-style split hero and does not place the primary experience in a decorative card.

### Navigation

Reframe primary navigation around Browse, Security, Docs, and Publish. Preserve semantic navigation, mobile disclosure state, keyboard order, minimum targets, and visible focus. Dashboard remains available contextually for publisher accounts.

### Server Detail

Break the current large route presentation into focused components without changing its canonicalization or database transaction. The first viewport contains server identity, source/registry summary, current health observation, supported clients, and the primary installation command or explanation. Detailed trust events, package and remote variants, required environment, aliases, and metadata follow as ordinary sections.

No component may express an aggregate score, certification, endorsement, or prediction. Time-sensitive observations include timestamps.

### Failure And Empty States

- Empty directories explain that no records are available and preserve navigation/search.
- Unknown evidence uses factual “Not observed” language.
- Stale or failed health observations include state and timestamp without implying server safety.
- Copy actions report success in a polite live region and keep the command selectable.
- Existing not-found, canonical redirect, and Suspense behaviors remain unchanged.

## CLI Architecture

### Entry Boundary

`runCli([])` enters an interactive session only when both input and output are TTY-capable. In every non-interactive no-argument case it prints the existing help text and exits `0`. Explicit commands, `--help`, `--version`, `--json`, parsers, envelopes, renderers, and documented exit codes remain unchanged.

### Session Controller

Add a session controller that owns navigation but not command behavior. Its main actions are Discover, Inspect, Install, Installed, Update, Remove, Doctor, and Quit. It collects only the minimum arguments for the selected action and dispatches through the same command boundary used by explicit invocation.

Command completion and operational failure return to the main menu after the result is shown. Invalid usage is prevented or corrected within the current flow. Back returns one level without executing. Quit, EOF, and `Ctrl+C` close the prompt cleanly with no stack trace. Cancellation exits `0` when no command was started; a command's existing result code remains authoritative once executed.

### Prompt Adapter

Use `@inquirer/prompts` behind `PromptIO`. Extend the abstraction only for capabilities the session requires, such as stable value/label choices and cancellation. Production prompts receive explicit input and output streams for testability. Arrow-key selection is the enhanced TTY default; a numbered/raw-list mode is available through a documented environment setting for terminal assistive technology and constrained terminals.

Secrets remain masked and are never retained by the session. The session does not add ANSI styling to redirected output.

### CLI Testing

- Unit-test the session controller with deterministic prompt and output doubles.
- Prove empty argv chooses session only for interactive dependencies.
- Prove each menu action dispatches the intended existing command arguments.
- Prove Back, Quit, EOF, `Ctrl+C`, command failure, and repeated actions.
- Preserve byte-level snapshots for explicit commands and JSON output.
- Add a PTY-level packed-binary smoke test for arrow-key selection and terminal restoration.

## Legal And Cookie Architecture

### Document Model

Extend the release-document model with optional metadata, local contents navigation, bullet lists, definition lists, and tables. The renderer remains semantic and reusable across Security, Privacy, Terms, Cookie Policy, and operator disclosure. It does not accept raw HTML.

### Cookie Policy

Add a public Cookie Policy that lists the currently observed strictly necessary cookies:

| Cookie                      | Provider                        | Purpose                                           | Duration                                           | Attributes                                                |
| --------------------------- | ------------------------------- | ------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| `better-auth.session_token` | The MCP Directory / Better Auth | Maintain an authenticated database-backed session | Seven days under the current default configuration | Host-only, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` |
| `better-auth.state`         | The MCP Directory / Better Auth | Validate the GitHub OAuth callback                | Approximately ten minutes under Better Auth 1.7.2  | Host-only, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` |

The page explains that no non-essential browser storage or tracking was identified and therefore no consent banner is shown under the current implementation. This is a technical statement, not legal advice. A new analytics, advertising, embedded-media, experimentation, support, or cross-site storage integration requires a fresh inventory and consent assessment before activation.

### Operator Disclosure

Add a public Operator Information page using only verified facts: Estopia Engineering Ltd and the existing Cowdenbeath, Fife, Scotland, United Kingdom postal address. It must not label the address as the registered office until confirmed. The page and release blockers identify the missing Companies House number, registration wording, monitored electronic contact, authorized representative, and VAT status as unresolved.

### Privacy And Terms

Improve wayfinding, cookie detail, data-category explanations, rights information, and links between related documents. Keep the existing legal-review draft labels. Do not choose lawful bases, processors, transfer mechanisms, governing law, jurisdiction, liability limits, age terms, supervisory authority, or effective dates without verified operator decisions and qualified review.

### Legal Testing

- Public routes for Cookie Policy and Operator Information return `200` and appear in footer navigation.
- Cookie names, purposes, durations, and security attributes match authentication configuration tests.
- No cookie banner appears while the approved inventory contains only necessary cookies.
- Privacy and Terms retain draft status.
- Missing operator and production-processing facts remain represented in release blockers and are not silently presented as resolved.

## Accessibility

All web work conforms to the repository's WCAG 2.2 AA requirements: semantic landmarks, one page `h1`, stable skip target, keyboard operation, visible focus, persistent labels, accessible names containing visible labels, contrast, Forced Colors, reduced motion, and 320px reflow. Tables use headers. Horizontal scrolling is limited to the cookie table container when unavoidable.

The CLI provides both arrow-key and numbered interaction, avoids color-only status, restores terminal state after cancellation, and preserves non-interactive output for automation and assistive tooling.

## Performance And Security

Do not add client-side analytics, third-party embeds, decorative image dependencies, or a client-side state framework. Prefer server components for public data. Keep browser JavaScript limited to interaction that requires it. Sanitize all terminal-rendered registry content through existing output paths. Never echo secrets.

## Verification

Each track follows red-green-refactor with its narrow package tests. The web track adds Playwright desktop/mobile screenshots and focused accessibility assertions. The CLI track runs unit, type, lint, binary, and PTY checks. The legal track runs route tests and authentication-cookie consistency checks. Final verification runs production E2E and the exact Node 24 release gate.

## Explicit Exclusions

- No popularity leaderboard or install-count ranking.
- No trust score, security score, certification, or endorsement.
- No copied `skills.sh` branding, assets, wording, ASCII mark, or source.
- No cookie banner without non-essential storage or tracking.
- No legal finalization or invented company details.
- No deployment, publication, tagging, DNS, secret, identity, or licensing action.
