import { PUBLISHER_RETENTION_DEFAULTS } from "@themcpdirectory/config";
import type { ReleaseDocument } from "@/content/document-model";

const OPERATOR_ADDRESS = [
  "Estopia Engineering Ltd",
  "3 Braemount",
  "Cowdenbeath",
  "Fife",
  "KY4 9RB",
  "Scotland",
  "United Kingdom",
] as const;

const LEGAL_DRAFT_LABEL = "Draft requiring qualified legal review before production launch.";

export function getSecurityPolicyDocument(): ReleaseDocument {
  return {
    title: "Security policy",
    description: "How to report a vulnerability and the boundaries of this pre-release service.",
    sections: [
      {
        id: "supported-version",
        heading: "Supported version",
        body: [
          "The MCP Directory is pre-release software. Security fixes are applied to the latest commit on main; no older release line is currently supported.",
        ],
      },
      {
        id: "reporting",
        heading: "Report a vulnerability",
        body: [
          "Do not publish vulnerability details in an issue, discussion, or pull request. Use GitHub's private vulnerability reporting form from the repository Security tab when it is available. This is the project's only direct private reporting channel today.",
          "If private reporting is unavailable, open a public issue that requests private maintainer contact without revealing the affected component, technical details, impact, credentials, personal data, or proof-of-concept material.",
          "The project does not currently promise a response or resolution service-level agreement.",
        ],
      },
      {
        id: "report-content",
        heading: "What to include privately",
        body: [
          "Include a concise description, the affected component and version or commit, safe reproduction steps, expected and observed impact, mitigations attempted, and a safe follow-up channel.",
          "Use synthetic fixtures and redact logs. Never include real access tokens, production credentials, personal data, or data copied from systems you do not own.",
        ],
      },
      {
        id: "boundaries",
        heading: "Security boundaries",
        body: [
          "Registry and repository metadata is untrusted. The implementation validates external responses, restricts outbound probes, and must not execute Registry-provided commands, scripts, package hooks, or expressions.",
          "Local secrets belong in ignored environment files. A committed secret must be revoked or rotated; deleting it from a later commit does not remove it from Git history.",
        ],
      },
    ],
  };
}

export function getPrivacyDraftDocument(): ReleaseDocument {
  return {
    title: "Privacy notice",
    description: "A factual draft of how the current service handles personal data.",
    draftLabel: LEGAL_DRAFT_LABEL,
    sections: [
      {
        id: "operator",
        heading: "Operator",
        body: [OPERATOR_ADDRESS.join("\n")],
      },
      {
        id: "anonymous-use",
        heading: "Anonymous use",
        body: [
          "You can browse the directory and use its public API without an account. Service infrastructure may process limited network and request metadata needed to deliver requests, prevent abuse, diagnose faults, and protect the service.",
          "Application request logs record events such as a request identifier, route template, method, status, duration, and coarse rate-limit outcome. They do not record search text, arbitrary resource identifiers, IP addresses, user agents, cookies, request bodies, or response bodies by default.",
        ],
      },
      {
        id: "accounts",
        heading: "GitHub sign-in and publisher accounts",
        body: [
          "Optional GitHub sign-in uses the read:user and user:email scopes to receive identity data such as a GitHub identifier, username, display name, avatar, and verified email address. The service stores account and session records when you sign in.",
          "Session records can include the IP address and user-agent supplied with a sign-in or authenticated request. They are used to maintain sessions and investigate abuse or security incidents and follow the session retention policy below.",
          "GitHub OAuth access tokens, refresh tokens, and ID tokens are cleared before account data is persisted. Short-lived GitHub App installation tokens used during publisher verification are not persisted.",
          "Publisher features store memberships, claims and verification state, account export or erasure requests, and audit events needed to attribute security-sensitive actions.",
        ],
      },
      {
        id: "cookies-and-analytics",
        heading: "Cookies and analytics",
        body: [
          "Signed-in publisher features use strictly necessary authentication cookies. The website does not use behavioural analytics, advertising, fingerprinting, session replay, marketing pixels, or cross-site tracking at launch.",
        ],
        links: [{ href: "/cookies", label: "Read the cookie policy" }],
      },
      {
        id: "cli-telemetry",
        heading: "Command-line telemetry",
        body: [
          "The mcpdir command-line client sends privacy-minimal, best-effort product telemetry by default. Set DO_NOT_TRACK=1 or MCPDIR_DISABLE_TELEMETRY=1 to disable telemetry before an event is constructed.",
          "The event contains the event name, canonical server slug when known, exact CLI version, supported target client when applicable, success, and package or remote variant when applicable. Storage retains CLI major/minor rather than the exact version and adds the server receipt time.",
          "The CLI event payload and stored event do not contain the search query, raw identifier, command arguments, paths, configuration or project content, error text, secrets, IP address, user agent, cookie, request ID, or a persistent device, installation, or person identifier. Network infrastructure necessarily processes source addresses and HTTP metadata transiently to deliver requests and limit abuse; the telemetry route is excluded from application request logs.",
          "Raw CLI events are retained for seven days and daily aggregates for thirteen months. Public server pages and badges expose anonymous, CLI-reported successful add totals and supported-client totals only. These counts are abuse-limited reports, not verified unique users or installations.",
        ],
      },
      {
        id: "directory-observations",
        heading: "Directory and health observations",
        body: [
          "The service imports public server records from the Official MCP Registry and may import public repository metadata from GitHub. Bounded remote health probes record technical outcomes for eligible public endpoints; they do not authenticate to those endpoints.",
        ],
      },
      {
        id: "purposes-and-basis",
        heading: "Purposes and legal basis",
        body: [
          "Data is used to provide and secure the directory, authenticate publishers, verify and administer publisher authority, respond to account requests, operate background jobs, and diagnose failures or abuse.",
          "Contract, legitimate interests, and legal obligations are possible lawful-basis candidates. Qualified counsel must confirm the applicable basis for each processing purpose before this draft becomes final.",
        ],
      },
      {
        id: "retention",
        heading: "Retention",
        body: [
          `Expired session records are eligible for deletion after a ${PUBLISHER_RETENTION_DEFAULTS.expiredSessionGraceDays}-day grace period. Unverified claims expire after ${PUBLISHER_RETENTION_DEFAULTS.claimExpiryDays} days, and expired or revoked claim evidence is retained for ${PUBLISHER_RETENTION_DEFAULTS.claimEvidenceDays} days.`,
          `Completed background outbox records are retained for ${PUBLISHER_RETENTION_DEFAULTS.outboxDays} days. Accounts with no login for ${PUBLISHER_RETENTION_DEFAULTS.dormantAccountDays} days may be deleted only when they have no active publisher responsibility, claim, legal hold, or unresolved erasure operation.`,
          `Publisher audit events are retained for ${PUBLISHER_RETENTION_DEFAULTS.auditDays} days. Remote health observations are retained for 90 days and trust-history observations for 24 months. Active legal holds can delay deletion.`,
          "Raw CLI telemetry events are retained for seven days and daily CLI telemetry aggregates for thirteen months.",
        ],
      },
      {
        id: "recipients-and-transfers",
        heading: "Recipients and international transfers",
        body: [
          "GitHub supplies identity and repository information, and the Official MCP Registry supplies public listing information. Deployment, database, proxy, backup, and logging providers must be recorded and reviewed before production launch.",
          "The final notice must identify verified processors, storage locations, transfer mechanisms, and safeguards. This draft does not claim arrangements that have not yet been selected and documented.",
        ],
      },
      {
        id: "rights",
        heading: "Your choices and rights",
        body: [
          "Signed-in users can request an account export or erasure. Erasure is resumable and can be delayed by an active legal hold or by publisher ownership that must first be transferred or locked for review.",
          "Other applicable rights and the process for exercising them require qualified legal review. Until a verified privacy contact is published, correspondence may be sent to the operator's postal address above.",
        ],
      },
      {
        id: "security",
        heading: "Security measures",
        body: [
          "The implemented controls include protected same-origin session cookies, origin checks on publisher mutations, scoped authorization, validated external data, bounded outbound probes, generic client-facing errors for unexpected publisher failures, and audited publisher actions.",
          "No internet service can guarantee absolute security. Vulnerabilities should be reported through the process on the Security policy page.",
        ],
      },
    ],
  };
}

export function getTermsDraftDocument(): ReleaseDocument {
  return {
    title: "Terms of service",
    description: "Draft terms for using The MCP Directory and its publisher features.",
    draftLabel: LEGAL_DRAFT_LABEL,
    sections: [
      {
        id: "operator-and-scope",
        heading: "Operator and service scope",
        body: [
          `The MCP Directory is operated by ${OPERATOR_ADDRESS[0]}. It provides public discovery information, factual trust and health observations, installation planning, a public API, a command-line client, and publisher account features.`,
          "These terms are a draft and do not take effect as final production terms until they have received qualified legal review and an effective date has been published.",
        ],
        links: [{ href: "/imprint", label: "Operator information" }],
      },
      {
        id: "trust-information",
        heading: "Trust information",
        body: [
          "Trust signals and health outcomes are factual observations from named sources. They are not an aggregate score, certification, endorsement, security audit, or guarantee that a server is safe, available, or suitable for a particular purpose.",
        ],
      },
      {
        id: "third-parties",
        heading: "Third-party dependencies",
        body: [
          "Listings and repository metadata depend on the Official MCP Registry and GitHub. Installation behavior also depends on the selected client, package ecosystem, server publisher, network, and local environment. Those third parties operate under their own terms and policies.",
        ],
      },
      {
        id: "installation",
        heading: "Installation responsibility",
        body: [
          "Review every installation plan, requested capability, command, package source, and configuration change before confirming it. Keep credentials and secret values out of command history, logs, receipts, and shared configuration.",
          "You remain responsible for deciding whether to install or run third-party software and for protecting the systems and accounts you control.",
        ],
      },
      {
        id: "acceptable-use",
        heading: "Acceptable use",
        body: [
          "Do not misuse the service to disrupt availability, bypass access controls or rate limits, probe private networks, distribute malicious material, impersonate another publisher, submit deceptive claims, or violate applicable law or third-party rights.",
        ],
      },
      {
        id: "accounts",
        heading: "Accounts and publisher authority",
        body: [
          "You are responsible for the GitHub account used to sign in and for actions taken through your session. Publisher members must only claim or administer listings they are authorized to represent and must keep membership and ownership information accurate.",
          "Access, claims, or listings may be restricted or suspended to protect users, investigate abuse, comply with legal obligations, or address loss of publisher authority.",
        ],
      },
      {
        id: "intellectual-property",
        heading: "Intellectual property",
        body: [
          "Listing metadata and linked software may be subject to third-party rights and licences. A process for reporting alleged intellectual-property infringement must be approved and published before these terms become final; no unmonitored contact channel is represented here.",
        ],
      },
      {
        id: "availability",
        heading: "Availability and changes",
        body: [
          "The service is pre-release and may change, be interrupted, or contain errors. No uptime, response-time, support, or continued-availability commitment is currently offered.",
        ],
      },
      {
        id: "governing-law",
        heading: "Governing law and final legal terms",
        body: [
          "Governing law, jurisdiction, limitation of liability, warranty language, age requirements, and an effective date remain subject to qualified legal review. No placeholder in this draft should be treated as a concluded legal position.",
        ],
      },
    ],
  };
}

export function getCookieDraftDocument(): ReleaseDocument {
  return {
    title: "Cookie policy",
    description:
      "The storage used for sign-in, why it is necessary, and what changes would require consent.",
    draftLabel: LEGAL_DRAFT_LABEL,
    sections: [
      {
        id: "current-use",
        heading: "Current use",
        body: [
          "The public directory can be browsed without an account. At launch, the service does not use advertising, behavioural analytics, fingerprinting, session replay, marketing pixels, or cross-site tracking cookies.",
          "Strictly necessary cookies are set only when you begin GitHub sign-in or use an authenticated publisher session. Disabling them prevents sign-in and publisher account features from working.",
        ],
      },
      {
        id: "auth-state",
        heading: "better-auth.state",
        body: [
          "Purpose: preserves and validates the short-lived GitHub OAuth sign-in transaction, helping prevent forged or mismatched callbacks.",
          "Duration: temporary and limited to the sign-in flow. Protection: Secure, HttpOnly, SameSite=Lax, Path=/.",
        ],
      },
      {
        id: "session-token",
        heading: "better-auth.session_token",
        body: [
          "Purpose: identifies an authenticated publisher session so protected account and listing-management features can be provided.",
          "Duration: until the session expires or is ended. Expired server-side session records follow the retention period described in the privacy notice. Protection: Secure, HttpOnly, SameSite=Lax, Path=/.",
        ],
      },
      {
        id: "consent",
        heading: "Consent and future changes",
        body: [
          "No consent banner is shown for the strictly necessary storage described above. If optional analytics, advertising, personalization, or other non-essential storage is introduced, it must remain off until the required choice has been offered and recorded.",
          "This policy must be updated before any new cookie or comparable browser storage is enabled in production.",
        ],
        links: [{ href: "/privacy", label: "Read the privacy notice" }],
      },
    ],
  };
}

export function getImprintDraftDocument(): ReleaseDocument {
  return {
    title: "Operator information",
    description:
      "Identity and contact information for the organisation responsible for The MCP Directory.",
    draftLabel: LEGAL_DRAFT_LABEL,
    sections: [
      {
        id: "operator",
        heading: "Service operator",
        body: [OPERATOR_ADDRESS.join("\n")],
      },
      {
        id: "status",
        heading: "Publication status",
        body: [
          "The service is pre-release. Verified company-registration details, an authorised representative, a monitored legal contact, tax information where applicable, and any jurisdiction-specific mandatory disclosures must be approved before this page is treated as final legal notice.",
          "No missing identifier or contact detail should be inferred from this draft, and no unmonitored contact channel is represented as available.",
        ],
      },
      {
        id: "responsibility",
        heading: "Content responsibility",
        body: [
          "Directory records and repository metadata are obtained from named third-party sources. Trust and health signals are factual observations, not certification, endorsement, or a guarantee of safety or availability.",
        ],
        links: [
          { href: "/terms", label: "Terms of service" },
          { href: "/security", label: "Security policy" },
        ],
      },
    ],
  };
}
