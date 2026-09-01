# Security Policy

## Supported Version

The MCP Directory is pre-release software. Security fixes are applied to the latest commit on `main`; no older release line is currently supported.

## Reporting a Vulnerability

Do not open a public issue, discussion, or pull request containing vulnerability details.

Use GitHub's private vulnerability reporting form from the repository's **Security** tab when it is available. This is the project's only direct private reporting channel today.

If private reporting is unavailable, open a public issue that only requests a private maintainer contact. That issue is a contact request, not the vulnerability report: do not reveal the affected component, technical details, impact, affected data, credentials, or proof-of-concept material. Send the actual report only after a maintainer provides a private channel.

Include privately:

- a concise description and affected component
- reproduction steps or a minimal proof of concept
- expected and observed impact
- affected versions or commit hashes
- mitigations already attempted
- a safe way to contact you for follow-up

Never include real access tokens, production credentials, personal data, or data copied from systems you do not own. Use synthetic fixtures and redact logs.

Maintainers will validate the report, coordinate remediation, and discuss disclosure timing with the reporter. This pre-release project does not currently promise a response or resolution service-level agreement.

## Security Boundaries

High-risk areas include:

- Registry and GitHub response validation
- outbound URL normalization and SSRF controls
- PostgreSQL migrations, advisory locks, and tenant-independent data integrity
- `pg-boss` retries and background job payloads
- rendering untrusted descriptions, metadata, links, and JSON-LD
- future package installation or client-configuration behavior

Repository metadata is untrusted. The current implementation must not execute Registry-provided commands, scripts, package hooks, or expressions. Any future installation manifest must remain declarative and require separate security review.

## Secrets

Local secrets belong in ignored `.env` or `.env.local` files. Never commit GitHub tokens, database credentials, remote request header values, private vulnerability details, or production URLs containing credentials.

If a secret is committed, revoke or rotate it immediately. Removing it in a later commit does not remove it from Git history; notify maintainers privately so history and downstream exposure can be assessed.

## Disclosure

Please allow maintainers a reasonable opportunity to investigate and release a fix before public disclosure. Coordinated disclosure should describe impact and remediation without publishing active secrets or unnecessary personal data.
