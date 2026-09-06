# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are developers and technical teams evaluating MCP servers for use in supported AI clients. Publishers also use the product to establish and administer authority over their listings.

## Product Purpose

The MCP Directory helps people find MCP servers, inspect factual source, trust, health, and compatibility information, and prepare reviewed installation changes. Success means a user can move from discovery to an informed installation decision without mistaking observations for certification or endorsement.

## Positioning

The product connects public discovery with inspectable trust evidence and client-aware installation planning. It does not rank servers by an opaque trust score and does not execute registry-provided commands without review.

## Operating Context

Users browse the web directory, search by server or capability, inspect server details, and use the `mcpdir` CLI to search, inspect, install, update, remove, and diagnose local MCP client configuration. Publisher workflows use GitHub sign-in and GitHub App verification.

## Capabilities and Constraints

- Public data comes from the Official MCP Registry and public repository metadata, with bounded remote health observations where eligible.
- Supported CLI clients are Codex, Claude Code, Cursor, and Visual Studio Code.
- Trust signals are factual observations, not ratings, certifications, endorsements, or security guarantees.
- Command and JSON interfaces are automation contracts and must remain backward compatible while interactive CLI navigation is added.
- Only strictly necessary authentication and OAuth security cookies are currently used. No behavioural analytics, advertising, fingerprinting, session replay, marketing pixels, or cross-site tracking is implemented.
- Legal documents remain drafts until qualified legal review. Estopia Engineering Ltd is the currently recorded operator; registration details, electronic contact, processors, transfers, final lawful bases, governing law, and effective dates remain open production decisions.

## Brand Commitments

The product name is The MCP Directory. Its voice is direct, technical, factual, and careful about the difference between evidence and assurance. The existing wordmark and the phrase “Find it. Trust it. Install it.” are established assets. The requested redesign uses `skills.sh` only as a structural reference for dense discovery and command fluency; it must not copy that product's branding, assets, wording, or popularity-first ranking.

## Evidence on Hand

- Real server, category, trust, health, compatibility, and installation data are available through the existing domain layer.
- Existing Playwright suites cover public routes, 320px reflow, skip-link focus, forced colors, serious and critical Axe violations, navigation, search, categories, and server details.
- Existing CLI tests and release verification cover explicit commands, JSON schemas, the packed binary, and an external TypeScript consumer.
- No testimonials, customer logos, field performance data, production uptime record, or approved legal claims are available and none may be fabricated.

## Product Principles

1. Make evidence easier to inspect than claims are to believe.
2. Keep discovery fast, dense, and comparable across routes.
3. Preserve explicit review before local configuration changes.
4. Keep automation stable while making human workflows approachable.
5. Collect and retain no more personal data than the service requires.

## Accessibility & Inclusion

The web interface targets WCAG 2.2 Level AA, including keyboard operation, visible focus, semantic landmarks, forced-colors support, reduced motion, and reflow at 320 CSS pixels. The interactive CLI must preserve a non-interactive fallback and provide a screen-reader-friendly numbered mode alongside enhanced arrow-key navigation.
