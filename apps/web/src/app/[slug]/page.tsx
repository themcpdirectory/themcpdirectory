import type { Metadata, Route } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getServerByIdentifier, getServerDetail } from "@themcpdirectory/domain";
import { normalizeHttpUrl } from "@themcpdirectory/security";
import { getDb } from "@/lib/db";
import { getSiteOrigin } from "@/lib/site-url";
import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const db = getDb();
  const match = await getServerByIdentifier(db, slug);
  if (!match) return { title: "Server not found" };
  if (match.needsRedirect) permanentRedirect(`/${match.canonicalSlug}`);

  const detail = await getServerDetail(db, match.canonicalSlug);
  if (!detail) return { title: "Server not found" };

  const canonicalUrl = `${getSiteOrigin()}/${detail.slug}`;
  return {
    title: detail.title,
    description: detail.shortDescription,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: detail.title,
      description: detail.shortDescription,
      url: canonicalUrl,
      type: "website",
    },
  };
}

interface EnvVar {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
}

function isEnvVarArray(val: unknown): val is EnvVar[] {
  return Array.isArray(val);
}

interface RemoteVar {
  description?: string;
  isRequired?: boolean;
  format?: string;
}

interface RemoteHeader {
  name: string;
  description?: string;
  isRequired?: boolean;
}

function isRemoteVarsRecord(val: unknown): val is Record<string, RemoteVar> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function isRemoteHeaderArray(val: unknown): val is RemoteHeader[] {
  return (
    Array.isArray(val) &&
    val.every(
      (header) =>
        typeof header === "object" &&
        header !== null &&
        "name" in header &&
        typeof header.name === "string",
    )
  );
}

function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function getSourceAvailabilityLabel(
  openSource: boolean | null,
  sourceAvailable: boolean | null,
): string {
  if (sourceAvailable === null) return "Unknown";
  if (sourceAvailable === false) return "Source unavailable";
  return openSource === true ? "Open source" : "Source available";
}

function normalizeStoredUrl(value: string | null): string | null {
  return value === null ? null : normalizeHttpUrl(value);
}

export default async function ServerDetailPage({ params }: Props) {
  const { slug } = await params;
  const db = getDb();
  const match = await getServerByIdentifier(db, slug);

  if (!match) {
    notFound();
  }

  // Redirect aliases to canonical slug
  if (match.needsRedirect) {
    permanentRedirect(`/${match.canonicalSlug}`);
  }

  const detail = await getServerDetail(db, match.canonicalSlug);
  if (!detail) {
    notFound();
  }

  const canonicalUrl = `${getSiteOrigin()}/${detail.slug}`;
  const repositoryUrl = normalizeStoredUrl(detail.repositoryUrl);
  const homepageUrl = normalizeStoredUrl(detail.homepageUrl);
  const publisherWebsiteUrl = normalizeStoredUrl(detail.publisherWebsiteUrl);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: detail.title,
    description: detail.shortDescription,
    applicationCategory: "DeveloperApplication",
    url: canonicalUrl,
    ...(repositoryUrl ? { codeRepository: repositoryUrl } : {}),
    ...(detail.licenseSpdx ? { license: detail.licenseSpdx } : {}),
  };

  const formattedLastSeen = detail.lastSeenAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <main id="main-content" tabIndex={-1} style={{ minHeight: "100vh" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "2rem 1rem" }}>
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          style={{ marginBottom: "1rem", fontSize: "0.8125rem", color: "var(--fg-muted)" }}
        >
          <Link href="/" style={{ color: "var(--accent)", textDecoration: "none" }}>
            The MCP Directory
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{detail.title}</span>
        </nav>

        {/* Header */}
        <header style={{ marginBottom: "1.75rem" }}>
          <div
            style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}
          >
            <h1
              style={{
                fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
                fontWeight: 700,
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              {detail.title}
            </h1>

            {detail.registrySourceKey === "official" &&
              detail.currentUpstreamStatus === "active" &&
              detail.listingStatus === "active" && (
                <span
                  title="Listed in the Official MCP Registry"
                  style={{
                    fontSize: "0.6875rem",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.125rem 0.4rem",
                    color: "var(--fg-muted)",
                    fontFamily: "var(--font-mono)",
                    alignSelf: "center",
                    background: "var(--surface-2)",
                  }}
                >
                  official registry
                </span>
              )}

            <span
              style={{
                fontSize: "0.6875rem",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "0.125rem 0.4rem",
                color: detail.listingStatus === "active" ? "var(--success-fg)" : "var(--warn-fg)",
                background:
                  detail.listingStatus === "active" ? "var(--success-bg)" : "var(--warn-bg)",
                alignSelf: "center",
              }}
            >
              {detail.listingStatus}
            </span>
          </div>

          <p
            style={{
              color: "var(--fg-muted)",
              fontSize: "0.9375rem",
              marginTop: "0.5rem",
              lineHeight: 1.5,
            }}
          >
            {detail.shortDescription}
          </p>

          {detail.publisherDisplayName && (
            <p style={{ fontSize: "0.8125rem", color: "var(--fg-muted)", marginTop: "0.375rem" }}>
              Published by{" "}
              {publisherWebsiteUrl ? (
                <a
                  href={publisherWebsiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)" }}
                >
                  {detail.publisherDisplayName}
                </a>
              ) : (
                <span>{detail.publisherDisplayName}</span>
              )}
              {detail.publisherVerified && (
                <span
                  title="Publisher identity verified"
                  style={{
                    marginLeft: "0.375rem",
                    color: "var(--success-fg)",
                    fontSize: "0.75rem",
                  }}
                >
                  ✓ verified
                </span>
              )}
            </p>
          )}
        </header>

        {/* CLI unavailable note */}
        <section
          aria-labelledby="install-heading"
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "1rem",
            background: "var(--surface-2)",
            marginBottom: "1.5rem",
          }}
        >
          <h2
            id="install-heading"
            style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.375rem" }}
          >
            Installation
          </h2>
          <p style={{ fontSize: "0.8125rem", color: "var(--fg-muted)", margin: 0 }}>
            The CLI is not yet available. Installation instructions coming soon.
          </p>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 28rem), 1fr))",
            gap: "1.25rem",
          }}
        >
          {/* Package information */}
          {detail.packages.length > 0 && (
            <section
              aria-labelledby="packages-heading"
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                background: "var(--surface)",
              }}
            >
              <h2
                id="packages-heading"
                style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}
              >
                Package
              </h2>
              {detail.packages.map((pkg) => (
                <div
                  key={pkg.id}
                  style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}
                >
                  <code
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.8125rem",
                      background: "var(--surface-2)",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "var(--radius-sm)",
                      wordBreak: "break-all",
                      display: "block",
                    }}
                  >
                    {pkg.identifier}
                    {pkg.version ? `@${pkg.version}` : ""}
                  </code>
                  <dl
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--fg-muted)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <dt style={{ fontWeight: 600, minWidth: "6rem", flexShrink: 0 }}>Registry</dt>
                      <dd style={{ margin: 0 }}>{pkg.registryType}</dd>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <dt style={{ fontWeight: 600, minWidth: "6rem", flexShrink: 0 }}>
                        Transport
                      </dt>
                      <dd style={{ margin: 0 }}>{pkg.transportType}</dd>
                    </div>
                    {pkg.runtimeHint && (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <dt style={{ fontWeight: 600, minWidth: "6rem", flexShrink: 0 }}>
                          Runtime
                        </dt>
                        <dd
                          style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}
                        >
                          {pkg.runtimeHint}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              ))}
            </section>
          )}

          {/* Remote endpoints */}
          {detail.remotes.length > 0 && (
            <section
              aria-labelledby="remotes-heading"
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                background: "var(--surface)",
              }}
            >
              <h2
                id="remotes-heading"
                style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}
              >
                Remote endpoint
              </h2>
              {detail.remotes.map((remote) => (
                <div
                  key={remote.id}
                  style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}
                >
                  <code
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.75rem",
                      background: "var(--surface-2)",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "var(--radius-sm)",
                      wordBreak: "break-all",
                      display: "block",
                    }}
                  >
                    {remote.urlTemplate}
                  </code>
                  <dl style={{ fontSize: "0.8125rem", color: "var(--fg-muted)" }}>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <dt style={{ fontWeight: 600, minWidth: "6rem", flexShrink: 0 }}>
                        Transport
                      </dt>
                      <dd style={{ margin: 0 }}>{remote.transportType}</dd>
                    </div>
                  </dl>
                  {isRemoteVarsRecord(remote.variables) &&
                    Object.keys(remote.variables).length > 0 && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <p
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            color: "var(--fg-muted)",
                            marginBottom: "0.25rem",
                          }}
                        >
                          URL variables
                        </p>
                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                          {Object.entries(remote.variables as Record<string, RemoteVar>).map(
                            ([name, varInfo]) => (
                              <li
                                key={name}
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--fg-muted)",
                                  display: "flex",
                                  gap: "0.5rem",
                                  alignItems: "baseline",
                                }}
                              >
                                <code
                                  style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}
                                >{`{${name}}`}</code>
                                {varInfo.description && <span>{varInfo.description}</span>}
                                {varInfo.isRequired && (
                                  <span style={{ color: "var(--error-fg)" }}>required</span>
                                )}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}
                  {isRemoteHeaderArray(remote.headers) && remote.headers.length > 0 && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <h3
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: "var(--fg-muted)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Request headers
                      </h3>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {remote.headers.map((header) => (
                          <li
                            key={header.name}
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--fg-muted)",
                              display: "flex",
                              gap: "0.5rem",
                              alignItems: "baseline",
                              flexWrap: "wrap",
                            }}
                          >
                            <code style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>
                              {header.name}
                            </code>
                            {header.description && <span>{header.description}</span>}
                            {header.isRequired && (
                              <span style={{ color: "var(--error-fg)" }}>required</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* Environment variables */}
          {detail.packages.some(
            (p) => isEnvVarArray(p.environmentVariables) && p.environmentVariables.length > 0,
          ) && (
            <section
              aria-labelledby="envvars-heading"
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                background: "var(--surface)",
              }}
            >
              <h2
                id="envvars-heading"
                style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}
              >
                Environment variables
              </h2>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {detail.packages.flatMap((pkg) =>
                  isEnvVarArray(pkg.environmentVariables)
                    ? pkg.environmentVariables.map((ev: EnvVar) => (
                        <li
                          key={ev.name}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.125rem",
                            fontSize: "0.8125rem",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <code
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontWeight: 600,
                                color: "var(--fg)",
                              }}
                            >
                              {ev.name}
                            </code>
                            {ev.isRequired && (
                              <span
                                style={{
                                  fontSize: "0.6875rem",
                                  color: "var(--error-fg)",
                                  background: "var(--error-bg)",
                                  borderRadius: "var(--radius-sm)",
                                  padding: "0 0.3rem",
                                }}
                              >
                                required
                              </span>
                            )}
                            {ev.isSecret && (
                              <span
                                style={{
                                  fontSize: "0.6875rem",
                                  color: "var(--warn-fg)",
                                  background: "var(--warn-bg)",
                                  borderRadius: "var(--radius-sm)",
                                  padding: "0 0.3rem",
                                }}
                              >
                                secret
                              </span>
                            )}
                          </div>
                          {ev.description && (
                            <span style={{ color: "var(--fg-muted)", fontSize: "0.75rem" }}>
                              {ev.description}
                            </span>
                          )}
                        </li>
                      ))
                    : [],
                )}
              </ul>
            </section>
          )}

          {/* Server info */}
          <section
            aria-labelledby="server-info-heading"
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "1rem",
              background: "var(--surface)",
            }}
          >
            <h2
              id="server-info-heading"
              style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}
            >
              Server info
            </h2>
            <dl
              style={{
                fontSize: "0.8125rem",
                color: "var(--fg-muted)",
                display: "flex",
                flexDirection: "column",
                gap: "0.375rem",
              }}
            >
              {detail.currentVersion && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <dt style={{ fontWeight: 600, minWidth: "7rem", flexShrink: 0 }}>Version</dt>
                  <dd style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                    {detail.currentVersion}
                  </dd>
                </div>
              )}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <dt style={{ fontWeight: 600, minWidth: "7rem", flexShrink: 0 }}>Last observed</dt>
                <dd style={{ margin: 0 }}>
                  <time dateTime={detail.lastSeenAt.toISOString()}>{formattedLastSeen}</time>
                </dd>
              </div>
              {detail.licenseSpdx && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <dt style={{ fontWeight: 600, minWidth: "7rem", flexShrink: 0 }}>License</dt>
                  <dd style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                    {detail.licenseSpdx}
                  </dd>
                </div>
              )}
              {repositoryUrl && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <dt style={{ fontWeight: 600, minWidth: "7rem", flexShrink: 0 }}>Repository</dt>
                  <dd style={{ margin: 0, overflow: "hidden" }}>
                    <a
                      href={repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent)", wordBreak: "break-all" }}
                    >
                      {repositoryUrl.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </div>
              )}
              {homepageUrl && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <dt style={{ fontWeight: 600, minWidth: "7rem", flexShrink: 0 }}>Homepage</dt>
                  <dd style={{ margin: 0, overflow: "hidden" }}>
                    <a
                      href={homepageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent)", wordBreak: "break-all" }}
                    >
                      {homepageUrl.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </div>
              )}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <dt style={{ fontWeight: 600, minWidth: "7rem", flexShrink: 0 }}>Source</dt>
                <dd style={{ margin: 0 }}>
                  {getSourceAvailabilityLabel(detail.openSource, detail.sourceAvailable)}
                </dd>
              </div>
              {detail.canonicalRegistryName && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <dt style={{ fontWeight: 600, minWidth: "7rem", flexShrink: 0 }}>
                    Registry name
                  </dt>
                  <dd
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.75rem",
                      wordBreak: "break-all",
                    }}
                  >
                    {detail.canonicalRegistryName}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Categories */}
          {detail.categorySlugs.length > 0 && (
            <section
              aria-labelledby="categories-heading"
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                background: "var(--surface)",
              }}
            >
              <h2
                id="categories-heading"
                style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}
              >
                Categories
              </h2>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {detail.categorySlugs.map((catSlug, i) => (
                  <Link
                    key={catSlug}
                    href={`/categories/${catSlug}` as Route}
                    style={{
                      fontSize: "0.8125rem",
                      padding: "0.25rem 0.625rem",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--surface-2)",
                      color: "var(--fg)",
                      textDecoration: "none",
                    }}
                  >
                    {detail.categoryNames[i] ?? catSlug}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Aliases */}
          {detail.aliases.length > 0 && (
            <section
              aria-labelledby="aliases-heading"
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                background: "var(--surface)",
              }}
            >
              <h2
                id="aliases-heading"
                style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}
              >
                Also known as
              </h2>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {detail.aliases.map((alias) => (
                  <code
                    key={alias}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.8125rem",
                      padding: "0.25rem 0.5rem",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--surface-2)",
                      color: "var(--fg-muted)",
                    }}
                  >
                    /{alias}
                  </code>
                ))}
              </div>
            </section>
          )}

          {/* Long description */}
          {detail.longDescription && (
            <section
              aria-labelledby="description-heading"
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                background: "var(--surface)",
                gridColumn: "1 / -1",
              }}
            >
              <h2
                id="description-heading"
                style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}
              >
                Description
              </h2>
              <p
                style={{
                  fontSize: "0.9375rem",
                  lineHeight: 1.6,
                  color: "var(--fg-muted)",
                  margin: 0,
                }}
              >
                {detail.longDescription}
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
