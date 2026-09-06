import type { Metadata, Route } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getRelatedServers,
  getServerByIdentifier,
  getServerDetail,
  getServerDetailBySlug,
  type ServerDetail,
} from "@themcpdirectory/domain";
import { normalizeHttpUrl } from "@themcpdirectory/security";
import { DeletedUpstreamBanner } from "@/components/deleted-upstream-banner";
import { InstallCommand } from "@/components/install-command";
import { ServerGrid } from "@/components/server-grid";
import { ServerDetailHeader } from "@/components/server-detail-header";
import { ServerEvidenceSummary } from "@/components/server-evidence-summary";
import { getDb } from "@/lib/db";
import { buildDocumentMetadata, buildCanonicalUrl } from "@/lib/metadata";
import {
  buildBreadcrumbJsonLd,
  buildSoftwareApplicationJsonLd,
  serializeJsonLd,
} from "@/lib/structured-data";
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

  return buildDocumentMetadata({
    title: detail.title,
    description: detail.shortDescription,
    path: `/${detail.slug}`,
    index: true,
  });
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

function InstallRequirements({
  detail,
}: {
  readonly detail: Pick<ServerDetail, "packages" | "remotes">;
}) {
  const requiredEnvironmentVariables = [
    ...new Set(
      detail.packages.flatMap((pkg) =>
        isEnvVarArray(pkg.environmentVariables)
          ? pkg.environmentVariables
              .filter((variable) => variable.isRequired)
              .map(({ name }) => name)
          : [],
      ),
    ),
  ];
  const hasRequirements =
    detail.packages.length > 0 ||
    detail.remotes.length > 0 ||
    requiredEnvironmentVariables.length > 0;

  return (
    <section aria-labelledby="requirements-heading" className="detail-requirements">
      <h2 id="requirements-heading">Requirements</h2>
      {hasRequirements ? (
        <dl className="detail-requirements__list">
          {detail.packages.map((pkg) => (
            <div key={pkg.id}>
              <dt>Package</dt>
              <dd>
                <code>
                  {pkg.identifier}
                  {pkg.version ? `@${pkg.version}` : ""}
                </code>
              </dd>
            </div>
          ))}
          {detail.remotes.map((remote) => (
            <div key={remote.id}>
              <dt>Remote</dt>
              <dd>
                <code>{remote.urlTemplate}</code>
              </dd>
            </div>
          ))}
          {requiredEnvironmentVariables.length > 0 ? (
            <div>
              <dt>Required environment</dt>
              <dd className="detail-requirements__values">
                {requiredEnvironmentVariables.map((name) => (
                  <code key={name}>{name}</code>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="detail-empty-state">No additional requirements are listed.</p>
      )}
    </section>
  );
}

export default async function ServerDetailPage({ params }: Props) {
  const { slug } = await params;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const db = getDb();
  const match = await getServerByIdentifier(db, slug);

  if (!match) {
    notFound();
  }

  // Redirect aliases to canonical slug
  if (match.needsRedirect) {
    permanentRedirect(`/${match.canonicalSlug}`);
  }

  const snapshot = await db.transaction(
    async (transaction) => {
      const detail = await getServerDetail(transaction, match.canonicalSlug);
      const publicDetail = await getServerDetailBySlug(transaction, match.canonicalSlug);
      return detail && publicDetail ? { detail, publicDetail } : null;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  if (!snapshot) {
    notFound();
  }
  const { detail, publicDetail } = snapshot;
  const relatedServers = await getRelatedServers(db, match.canonicalSlug, 3);

  const canonicalUrl = buildCanonicalUrl(`/${detail.slug}`);
  const repositoryUrl = normalizeStoredUrl(detail.repositoryUrl);
  const homepageUrl = normalizeStoredUrl(detail.homepageUrl);
  const publisherWebsiteUrl = normalizeStoredUrl(detail.publisherWebsiteUrl);

  const softwareJsonLd = buildSoftwareApplicationJsonLd({
    slug: canonicalUrl,
    title: detail.title,
    shortDescription: detail.shortDescription,
  });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "The MCP Directory", path: buildCanonicalUrl("/") },
    { name: detail.title, path: canonicalUrl },
  ]);

  const formattedLastSeen = detail.lastSeenAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareJsonLd) }}
      />
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />

      <div className="page-container">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">The MCP Directory</Link>
          <span aria-hidden="true"> / </span>
          <span>{detail.title}</span>
        </nav>

        <ServerDetailHeader
          detail={detail}
          installs={publicDetail.installs}
          publisherWebsiteUrl={publisherWebsiteUrl}
        />

        <DeletedUpstreamBanner listingStatus={publicDetail.listingStatus} />

        <div className="detail-page-layout">
          <aside className="detail-page__install-rail" aria-label="Installation preparation">
            <InstallRequirements detail={detail} />
            <InstallCommand
              slug={detail.slug}
              installAvailability={publicDetail.installAvailability}
            />
          </aside>

          <div className="detail-page__main">
            <ServerEvidenceSummary
              trustProfile={publicDetail.trustProfile}
              health={publicDetail.latestHealth}
              compatibility={publicDetail.compatibility}
            />

            <div className="detail-section-grid">
              {/* Package information */}
              {detail.packages.length > 0 && (
                <section aria-labelledby="packages-heading" className="detail-section">
                  <h2 id="packages-heading">Package</h2>
                  {detail.packages.map((pkg) => (
                    <div key={pkg.id} className="detail-stack">
                      <code className="detail-code">
                        {pkg.identifier}
                        {pkg.version ? `@${pkg.version}` : ""}
                      </code>
                      <dl className="detail-fact-list">
                        <div>
                          <dt>Registry</dt>
                          <dd>{pkg.registryType}</dd>
                        </div>
                        <div>
                          <dt>Transport</dt>
                          <dd>{pkg.transportType}</dd>
                        </div>
                        {pkg.runtimeHint && (
                          <div>
                            <dt>Runtime</dt>
                            <dd className="machine-value">{pkg.runtimeHint}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  ))}
                </section>
              )}

              {/* Remote endpoints */}
              {detail.remotes.length > 0 && (
                <section aria-labelledby="remotes-heading" className="detail-section">
                  <h2 id="remotes-heading">Remote endpoint</h2>
                  {detail.remotes.map((remote) => (
                    <div key={remote.id} className="detail-stack">
                      <code className="detail-code">{remote.urlTemplate}</code>
                      <dl className="detail-fact-list">
                        <div>
                          <dt>Transport</dt>
                          <dd>{remote.transportType}</dd>
                        </div>
                      </dl>
                      {isRemoteVarsRecord(remote.variables) &&
                        Object.keys(remote.variables).length > 0 && (
                          <div className="detail-subsection">
                            <p>URL variables</p>
                            <ul className="detail-list">
                              {Object.entries(remote.variables as Record<string, RemoteVar>).map(
                                ([name, varInfo]) => (
                                  <li key={name} className="detail-list-item detail-inline">
                                    <code>{`{${name}}`}</code>
                                    {varInfo.description && <span>{varInfo.description}</span>}
                                    {varInfo.isRequired && (
                                      <span className="detail-required">required</span>
                                    )}
                                  </li>
                                ),
                              )}
                            </ul>
                          </div>
                        )}
                      {isRemoteHeaderArray(remote.headers) && remote.headers.length > 0 && (
                        <div className="detail-subsection">
                          <h3>Request headers</h3>
                          <ul className="detail-list">
                            {remote.headers.map((header) => (
                              <li key={header.name} className="detail-list-item detail-inline">
                                <code>{header.name}</code>
                                {header.description && <span>{header.description}</span>}
                                {header.isRequired && (
                                  <span className="detail-required">required</span>
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
                <section aria-labelledby="envvars-heading" className="detail-section">
                  <h2 id="envvars-heading">Environment variables</h2>
                  <ul className="detail-list">
                    {detail.packages.flatMap((pkg) =>
                      isEnvVarArray(pkg.environmentVariables)
                        ? pkg.environmentVariables.map((ev: EnvVar) => (
                            <li key={ev.name} className="detail-list-item">
                              <div className="detail-inline">
                                <code>{ev.name}</code>
                                {ev.isRequired && <span className="detail-required">required</span>}
                                {ev.isSecret && <span className="detail-secret">secret</span>}
                              </div>
                              {ev.description && <span>{ev.description}</span>}
                            </li>
                          ))
                        : [],
                    )}
                  </ul>
                </section>
              )}

              {/* Server info */}
              <section aria-labelledby="server-info-heading" className="detail-section">
                <h2 id="server-info-heading">Server info</h2>
                <dl className="detail-fact-list">
                  {detail.currentVersion && (
                    <div>
                      <dt>Version</dt>
                      <dd className="machine-value">{detail.currentVersion}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Last observed</dt>
                    <dd>
                      <time dateTime={detail.lastSeenAt.toISOString()}>{formattedLastSeen}</time>
                    </dd>
                  </div>
                  {detail.licenseSpdx && (
                    <div>
                      <dt>License</dt>
                      <dd className="machine-value">{detail.licenseSpdx}</dd>
                    </div>
                  )}
                  {repositoryUrl && (
                    <div>
                      <dt>Repository</dt>
                      <dd>
                        <a href={repositoryUrl} target="_blank" rel="noopener noreferrer">
                          {repositoryUrl.replace(/^https?:\/\//, "")}
                        </a>
                      </dd>
                    </div>
                  )}
                  {homepageUrl && (
                    <div>
                      <dt>Homepage</dt>
                      <dd>
                        <a href={homepageUrl} target="_blank" rel="noopener noreferrer">
                          {homepageUrl.replace(/^https?:\/\//, "")}
                        </a>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Source</dt>
                    <dd>{getSourceAvailabilityLabel(detail.openSource, detail.sourceAvailable)}</dd>
                  </div>
                  {detail.canonicalRegistryName && (
                    <div>
                      <dt>Registry name</dt>
                      <dd className="machine-value">{detail.canonicalRegistryName}</dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* Categories */}
              {detail.categorySlugs.length > 0 && (
                <section aria-labelledby="categories-heading" className="detail-section">
                  <h2 id="categories-heading">Categories</h2>
                  <div className="detail-tag-list">
                    {detail.categorySlugs.map((catSlug, i) => (
                      <Link
                        key={catSlug}
                        href={`/categories/${catSlug}` as Route}
                        className="detail-tag"
                      >
                        {detail.categoryNames[i] ?? catSlug}
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Aliases */}
              {detail.aliases.length > 0 && (
                <section aria-labelledby="aliases-heading" className="detail-section">
                  <h2 id="aliases-heading">Also known as</h2>
                  <div className="detail-tag-list">
                    {detail.aliases.map((alias) => (
                      <code key={alias} className="detail-tag">
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
                  className="detail-section detail-section--wide"
                >
                  <h2 id="description-heading">Description</h2>
                  <p className="detail-long-copy">{detail.longDescription}</p>
                </section>
              )}
            </div>

            {relatedServers.length > 0 ? (
              <section aria-labelledby="related-servers-heading" className="detail-related-servers">
                <div className="detail-related-servers__heading">
                  <h2 id="related-servers-heading">Related servers</h2>
                  <p>Shared categories or publisher, ordered from current directory facts.</p>
                </div>
                <ServerGrid servers={relatedServers} emptyMessage="No related servers found." />
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
