import type { Metadata, Route } from "next";
import {
  getDiscoverySections,
  getEcosystemFacts,
  type CollectionSummary,
  type DiscoveryCategorySummary,
  type DiscoveryServer,
} from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import { CategoryCard } from "@/components/category-card";
import { CollectionCard } from "@/components/collection-card";
import { HeroSearch } from "@/components/home/hero-search";
import { EcosystemFacts } from "@/components/home/ecosystem-facts";
import { DiscoverySection } from "@/components/home/discovery-section";
import { ServerCard } from "@/components/server-card";
import { buildDocumentMetadata } from "@/lib/metadata";
import { buildPublicAddCommand } from "@/lib/public-cli-command";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildDocumentMetadata({
  title: "The MCP Directory — Find it. Trust it. Install it.",
  description:
    "Search MCP servers, inspect factual provenance, and install through the reviewed CLI flow.",
  path: "/",
  index: true,
});

export default async function HomePage() {
  const db = getDb();
  const [facts, sections] = await Promise.all([getEcosystemFacts(db), getDiscoverySections(db)]);
  const homepageCollections = sections.collections.filter(
    (collection) => !collection.slug.startsWith("works-with-"),
  );

  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <HeroSearch command={buildPublicAddCommand("github")} />
      <EcosystemFacts facts={facts} />

      <div className="page-container home-page__content">
        <DiscoverySection<DiscoveryServer>
          title="Recommended servers"
          description="Ordered from public directory facts: Official Registry provenance, verified publisher state, metadata completeness, and recent repository maintenance."
          action={
            <Link
              href={"/collections/official-registry-essentials" as Route}
              className="home-action-link"
            >
              Open essentials
            </Link>
          }
          items={sections.recommended}
          renderItem={(server) => <ServerCard server={server} />}
        />

        <DiscoverySection<DiscoveryServer>
          title="Recently added"
          description="Newest public listings ordered by first discovery time."
          action={
            <Link href={"/collections/recently-added" as Route} className="home-action-link">
              Open recent
            </Link>
          }
          items={sections.recentlyAdded}
          renderItem={(server) => <ServerCard server={server} />}
        />

        <DiscoverySection<CollectionSummary>
          title="Collections"
          description="Goal-oriented discovery entry points assembled from current public directory facts."
          action={
            <Link href="/collections" className="home-action-link">
              Browse collections
            </Link>
          }
          items={homepageCollections}
          renderItem={(collection) => <CollectionCard collection={collection} />}
        />

        <DiscoverySection<DiscoveryCategorySummary>
          title="Categories"
          description="Only categories with active public listings appear here."
          action={
            <Link href="/categories" className="home-action-link">
              Browse categories
            </Link>
          }
          items={sections.categories}
          renderItem={(category) => <CategoryCard category={category} />}
        />

        <section aria-labelledby="publisher-cta-heading" className="home-publisher-cta">
          <div className="home-publisher-cta__body">
            <h2 id="publisher-cta-heading" className="home-section__title">
              Publish a server
            </h2>
            <p className="home-publisher-cta__description">
              Publish through the Official MCP Registry and verify publisher authority before your
              listing reaches the directory.
            </p>
          </div>

          <Link href="/publish" className="text-link-action text-link-action--primary">
            Publish a server
          </Link>
        </section>
      </div>
    </main>
  );
}
