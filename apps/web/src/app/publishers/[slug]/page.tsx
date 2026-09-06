import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { browseServers, getPublicPublishers } from "@themcpdirectory/domain";
import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { ServerGrid } from "@/components/server-grid";
import { getDb } from "@/lib/db";
import { buildDocumentMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

async function getPublicPublisherPageData(slug: string) {
  const db = getDb();
  const publishers = await getPublicPublishers(db);
  const publisher = publishers.find((entry) => entry.slug === slug);

  if (!publisher) {
    return null;
  }

  const results = await browseServers(db, {
    publisher: publisher.slug,
    sort: "recent",
    page: 1,
    pageSize: 24,
  });

  if (results.items.length === 0) {
    return null;
  }

  return { publisher, servers: results.items };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicPublisherPageData(slug);

  if (!data) {
    return { title: "Publisher not found" };
  }

  return buildDocumentMetadata({
    title: data.publisher.name,
    description: `Active public MCP server listings published by ${data.publisher.name}.`,
    path: `/publishers/${data.publisher.slug}`,
    index: true,
  });
}

export default async function PublisherDetailPage({ params }: Props) {
  const { slug } = await params;
  const data = await getPublicPublisherPageData(slug);

  if (!data) {
    notFound();
  }

  const { publisher, servers } = data;

  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <div className="page-container page-container--narrow page-container--reading">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">The MCP Directory</Link>
          <span aria-hidden="true"> / </span>
          <Link href="/publishers">Publishers</Link>
          <span aria-hidden="true"> / </span>
          <span>{publisher.name}</span>
        </nav>

        <header className="page-header">
          <h1 className="page-title">{publisher.name}</h1>
          <p className="page-description">
            Stored publisher metadata and active public listings linked to this verified publisher.
          </p>
          <p className="section-label">{publisher.serverCount} servers</p>
        </header>

        <section aria-labelledby="publisher-facts-heading" className="detail-section">
          <h2 id="publisher-facts-heading">Publisher facts</h2>
          <dl className="detail-fact-list">
            <div>
              <dt>Verification</dt>
              <dd>Verified publisher</dd>
            </div>
            {publisher.websiteUrl ? (
              <div>
                <dt>Website</dt>
                <dd>
                  <a href={publisher.websiteUrl} className="text-link-action">
                    {publisher.websiteUrl}
                  </a>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Browse</dt>
              <dd>
                <Link href={`/browse?publisher=${publisher.slug}`} className="text-link-action">
                  Open filtered Browse results
                </Link>
              </dd>
            </div>
          </dl>
        </section>

        <section className="search-panel">
          <SectionHeader
            title="Current servers"
            description="These cards reflect the active public listings currently associated with this publisher."
            action={
              <Link href={`/browse?publisher=${publisher.slug}`} className="home-action-link">
                Open in Browse
              </Link>
            }
          />

          <ServerGrid
            servers={servers}
            emptyMessage="No active public server listings are currently associated with this publisher."
          />
        </section>
      </div>
    </main>
  );
}
